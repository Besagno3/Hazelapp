import { cn } from '../../lib/utils';

export interface Picture {
  id: string;
  emoji: string;
  name: string;
}

/** A grid of pictures to pick one from (a kid's tile, their secret picture). */
export default function PicturePicker({
  label,
  pictures,
  value,
  onChange,
  columns = 'grid-cols-4 sm:grid-cols-6',
}: {
  label: string;
  pictures: readonly Picture[];
  value: string | null;
  onChange: (id: string) => void;
  columns?: string;
}) {
  return (
    <fieldset>
      <legend className="block text-xs text-gray-500 mb-1">{label}</legend>
      <div className={cn('grid gap-1.5', columns)}>
        {pictures.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onChange(p.id)}
            aria-pressed={value === p.id}
            aria-label={p.name}
            title={p.name}
            className={cn(
              'aspect-square min-h-11 rounded-lg text-2xl flex items-center justify-center border-2 transition',
              value === p.id ? 'border-purple-500 bg-purple-50' : 'border-transparent bg-gray-50 hover:bg-gray-100',
            )}
          >
            <span aria-hidden>{p.emoji}</span>
          </button>
        ))}
      </div>
    </fieldset>
  );
}
