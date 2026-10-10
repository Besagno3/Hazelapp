import { PRIVACY_IS_DRAFT, PRIVACY_NOTICE } from '../../content/family';

/** The privacy notice a grown-up agrees to (#118), folded away until opened. */
export default function PrivacyNotice({ open = false }: { open?: boolean }) {
  return (
    <details open={open} className="text-sm text-gray-600 border border-gray-200 rounded-lg">
      <summary className="cursor-pointer px-3 py-2 font-medium text-purple-700">
        Privacy notice for grown-ups
        {PRIVACY_IS_DRAFT && (
          <span className="ml-2 align-middle text-[10px] font-bold uppercase tracking-wide bg-amber-100 text-amber-800 rounded px-1.5 py-0.5">
            Draft
          </span>
        )}
      </summary>
      <div className="px-3 pb-3 max-h-64 overflow-y-auto space-y-2">
        {PRIVACY_NOTICE.map((s) => (
          <div key={s.heading}>
            <h3 className="font-semibold text-gray-700">{s.heading}</h3>
            <p>{s.body}</p>
          </div>
        ))}
      </div>
    </details>
  );
}
