-- CI test for migration 0017 (#151): a save never goes back to an older copy.
-- Any failed assertion raises and exits non-zero under `psql -v ON_ERROR_STOP=1`.
begin;

-- A grown-up from the old sign-up (their login is also their first kid).
insert into auth.users (id, raw_user_meta_data)
  values ('00000000-0000-0000-0000-0000000000e1', '{"birth_year": 2016, "birth_month": 5}');

-- Saves are written through the API role, as the app writes them.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', true);

do $$
declare
  uid uuid := '00000000-0000-0000-0000-0000000000e1';
  kid2 uuid;
  junk text;
  refused text;
  detail text;
begin
  -- A save from before revisions: apps from before revisions keep saving over it.
  insert into public.saves (profile_id, data) values (uid, '{"version": 3, "coins": 1}');
  update public.saves set data = '{"version": 3, "coins": 2}' where profile_id = uid;
  assert (select (data ->> 'coins')::int from public.saves where profile_id = uid) = 2,
    'a save without a revision may be saved over by one without';

  -- The new app's first save gives it a revision: a row without one upgrades.
  insert into public.saves (profile_id, data) values (uid, '{"version": 3, "revision": 1, "coins": 3}')
    on conflict (profile_id) do update set data = excluded.data;
  assert (select (data ->> 'revision')::int from public.saves where profile_id = uid) = 1,
    'a save without a revision upgrades to one with';

  -- Now an app from before revisions (no revision at all) can't write over it…
  begin
    insert into public.saves (profile_id, data) values (uid, '{"version": 3, "coins": 99}')
      on conflict (profile_id) do update set data = excluded.data;
  exception when others then
    get stacked diagnostics refused = message_text, detail = pg_exception_detail;
  end;
  assert refused like 'save_version_conflict%', 'an old app tab must not overwrite a save with a revision';
  assert detail = 'save_revision_conflict', 'the refusal says it was about revisions';

  -- …nor a junk revision (it counts as none): a string, a negative, a
  -- fraction, 16 digits.
  foreach junk in array array['"9"', '-5', '2.5', '1234567890123456'] loop
    refused := null;
    begin
      update public.saves set data = format('{"version": 3, "revision": %s, "coins": 98}', junk)::jsonb
        where profile_id = uid;
    exception when others then
      refused := sqlerrm;
    end;
    assert refused like 'save_version_conflict%', format('a junk revision (%s) must be refused', junk);
  end loop;
  assert (select (data ->> 'coins')::int from public.saves where profile_id = uid) = 3,
    'the save with the revision is kept';

  -- A newer revision saves; an older one is refused.
  update public.saves set data = '{"version": 3, "revision": 10, "coins": 10}' where profile_id = uid;
  refused := null;
  begin
    update public.saves set data = '{"version": 3, "revision": 9, "coins": 9}' where profile_id = uid;
  exception when others then
    refused := sqlerrm;
  end;
  assert refused like 'save_version_conflict%revision 10%refusing revision 9%', 'an older revision must be refused';

  -- Two devices both at revision 10: the first to write 11 wins, the second is refused.
  update public.saves set data = '{"version": 3, "revision": 11, "coins": 111}' where profile_id = uid;
  refused := null;
  begin
    insert into public.saves (profile_id, data) values (uid, '{"version": 3, "revision": 11, "coins": 112}')
      on conflict (profile_id) do update set data = excluded.data;
  exception when others then
    refused := sqlerrm;
  end;
  assert refused like 'save_version_conflict%', 'an equal revision with other progress must be refused';
  assert (select (data ->> 'coins')::int from public.saves where profile_id = uid) = 111,
    'the first device''s save is kept';

  -- The very same save sent again (a retried upload) changes nothing and is fine.
  update public.saves set data = '{"coins": 111, "revision": 11, "version": 3}' where profile_id = uid;

  -- The version rule still stands: a newer revision from an older game is refused.
  refused := null;
  begin
    update public.saves set data = '{"version": 2, "revision": 50, "coins": 50}' where profile_id = uid;
  exception when others then
    refused := sqlerrm;
  end;
  assert refused like 'save_version_conflict: this save was written by a newer version%',
    'a lower version is still refused';
  assert (select (data ->> 'coins')::int from public.saves where profile_id = uid) = 111,
    'nothing older replaced the newest save';

  -- A brand-new save can start at any revision (there is nothing to write over).
  insert into public.profiles (display_name, icon, birth_year, birth_month)
    values ('Kit', 'panda', 2019, 8) returning id into kid2;
  insert into public.saves (profile_id, data) values (kid2, '{"version": 3, "revision": 0, "coins": 0}')
    on conflict (profile_id) do update set data = excluded.data;
  update public.saves set data = '{"version": 3, "revision": 1, "coins": 1}' where profile_id = kid2;
  assert (select (data ->> 'revision')::int from public.saves where profile_id = kid2) = 1,
    'a new save starts and moves up';
end $$;

rollback;
