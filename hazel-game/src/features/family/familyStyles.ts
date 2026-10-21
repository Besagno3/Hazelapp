/** Class lists the family screens share (a component file only exports components, so they live here). */

/** A text link 44 px tall, so a finger finds it (the gate's and the dialog's ways out). */
export const gateLinkClass = 'w-full min-h-11 text-center text-sm hover:underline';

/** A main button that waits with `aria-disabled` (a disabled one drops the keyboard's focus). */
export const gatePrimaryClass =
  'bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg py-2 transition aria-disabled:cursor-default aria-disabled:opacity-50 aria-disabled:hover:bg-purple-600';

/** A form field; a box a refusal is about is marked `aria-invalid` and turns red. */
export const familyFieldClass =
  'w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-400 aria-[invalid=true]:border-red-500';

/** Sign-in's labels: the forms that matter most aren't the hardest to read. */
export const familyLabelClass = 'mb-1 block text-sm font-medium text-gray-700';
