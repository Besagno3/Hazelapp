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
  it('offers all five heroes, the heroines Skye and Nyx among them', () => {
    render(<AvatarSelect />);
    expect(screen.getAllByRole('button')).toHaveLength(5);
    for (const name of ['Blaze', 'Shield', 'Nova', 'Skye', 'Nyx']) expect(card(name)).toBeInTheDocument();
  });

  it("shows each heroine's type and her two special abilities", () => {
    render(<AvatarSelect />);
    const skye = within(card('Skye'));
    expect(skye.getByText('Swift')).toBeInTheDocument();
    expect(skye.getByText('Counter Strike:')).toBeInTheDocument();
    expect(skye.getByText('Fox Sense:')).toBeInTheDocument();
    const nyx = within(card('Nyx'));
    expect(nyx.getByText('Mystic')).toBeInTheDocument();
    expect(nyx.getByText('Spark Start:')).toBeInTheDocument();
    expect(nyx.getByText('Spell Power:')).toBeInTheDocument();
  });

  it('the original three show their type and no ability list', () => {
    render(<AvatarSelect />);
    expect(within(card('Blaze')).getByText('Aggressive')).toBeInTheDocument();
    expect(within(card('Blaze')).queryByRole('list')).toBeNull();
  });

  it('picking Nyx saves her as the hero and moves on', () => {
    render(<AvatarSelect />);
    fireEvent.click(card('Nyx'));
    expect(useSaveStore.getState().save!.avatarId).toBe('a5');
    expect(sendFlow).toHaveBeenCalledWith({ type: 'CHOOSE_AVATAR' });
  });
});
