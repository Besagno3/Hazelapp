import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';

vi.mock('../../machines/gameFlow', () => ({ sendFlow: vi.fn() }));

const { default: AvatarSelect } = await import('./AvatarSelect');
const { sendFlow } = await import('../../machines/gameFlow');
const { useSaveStore } = await import('../../store/saveStore');
const { defaultSave } = await import('../../lib/save');

beforeEach(() => {
  vi.mocked(sendFlow).mockClear();
  useSaveStore.setState({ userId: null, save: defaultSave(), status: 'ready', remoteError: null });
});

const card = (name: string) => screen.getByRole('button', { name: new RegExp(`\\b${name}\\b`) });

describe('AvatarSelect — five heroes', () => {
  it('offers all five heroes under their new names', () => {
    render(<AvatarSelect />);
    // Five heroes; the top bar's Switch is the only other button (#110h).
    const heroes = screen.getAllByRole('button').filter((b) => !screen.getByTestId('screen-topbar').contains(b));
    expect(heroes).toHaveLength(5);
    for (const name of ['Valor', 'Bastion', 'Talon', 'Kira', 'Selene']) expect(card(name)).toBeInTheDocument();
  });

  it('the level, streak and Switch sit in a top bar in the page, before the heading (#110h)', () => {
    render(<AvatarSelect />);
    const bar = screen.getByTestId('screen-topbar');
    expect(bar.querySelector('.fixed')).toBeNull();
    expect(bar).toHaveTextContent(/Level/);
    expect(within(bar).getByRole('button', { name: 'Switch player' })).toBeInTheDocument();
    const heading = screen.getByRole('heading', { name: 'Pick Your Hero' });
    expect(bar.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("shows every hero's type and two signature abilities", () => {
    render(<AvatarSelect />);
    const expected: Record<string, [string, string, string]> = {
      Valor: ['Warrior', 'Battle Cry:', 'Lionheart:'],
      Bastion: ['Guardian', 'Shell Up:', 'Rock Steady:'],
      Talon: ['Ranger', 'Second Wind:', 'Keen Eye:'],
      Kira: ['Duelist', 'Counter Strike:', 'Fox Sense:'],
      Selene: ['Mystic', 'Spark Start:', 'Spell Power:'],
    };
    for (const [name, [type, ...abilities]] of Object.entries(expected)) {
      const c = within(card(name));
      expect(c.getByText(type)).toBeInTheDocument();
      expect(c.getAllByRole('listitem')).toHaveLength(2);
      for (const ab of abilities) expect(c.getByText(ab)).toBeInTheDocument();
    }
  });

  it('picking Selene saves her as the hero and moves on', () => {
    render(<AvatarSelect />);
    fireEvent.click(card('Selene'));
    expect(useSaveStore.getState().save!.avatarId).toBe('a5');
    expect(sendFlow).toHaveBeenCalledWith({ type: 'CHOOSE_AVATAR' });
  });
});
