-- CI test for migration 0011 (#101h): a save's version never goes down. Any
-- failed assertion raises and exits non-zero under `psql -v ON_ERROR_STOP=1`.
begin;

do $$
declare
  uid uuid := '00000000-0000-0000-0000-0000000000d1';
  refused text;
begin
  insert into auth.users (id, raw_user_meta_data)
    values (uid, '{"birth_year": 2016, "birth_month": 5}');
  insert into public.saves (profile_id, data) values (uid, '{"version": 2, "coins": 5}');

  -- Saving the same version, or a newer one, works as always.
  update public.saves set data = '{"version": 2, "coins": 6}' where profile_id = uid;
  update public.saves set data = '{"version": 3, "coins": 7}' where profile_id = uid;
  assert (select (data ->> 'coins')::int from public.saves where profile_id = uid) = 7,
    'same/newer versions must save';

  -- An older version is refused, and the newer save is kept.
  begin
    update public.saves set data = '{"version": 2, "coins": 1}' where profile_id = uid;
  exception when others then
    refused := sqlerrm;
  end;
  assert refused like 'save_version_conflict%', 'an older save must not overwrite a newer one';
  assert (select (data ->> 'coins')::int from public.saves where profile_id = uid) = 7,
    'the newer save must be kept';

  -- The client saves with an upsert: refused the same way.
  refused := null;
  begin
    insert into public.saves (profile_id, data) values (uid, '{"version": 1, "coins": 2}')
      on conflict (profile_id) do update set data = excluded.data;
  exception when others then
    refused := sqlerrm;
  end;
  assert refused like 'save_version_conflict%', 'an upsert from an older client must be refused';

  -- No version (the oldest saves) or a junk one — even a number in a string —
  -- counts as v1, as the client reads it: it may move up, and a v1 save may be
  -- saved over by another v1.
  delete from public.saves where profile_id = uid;
  insert into public.saves (profile_id, data) values (uid, '{"coins": 3}');
  update public.saves set data = '{"version": "soon", "coins": 4}' where profile_id = uid;
  update public.saves set data = '{"version": "9", "coins": 4}' where profile_id = uid;
  update public.saves set data = '{"version": 1, "coins": 5}' where profile_id = uid;
  update public.saves set data = '{"version": 2, "coins": 6}' where profile_id = uid;
  assert (select (data ->> 'version')::int from public.saves where profile_id = uid) = 2,
    'an unversioned save upgrades normally';
end $$;

rollback;
