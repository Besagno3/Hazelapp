import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

/** The white card on the purple sky that every family screen sits in (#118), like sign-in. */
export default function FamilyCard({
  title,
  subtitle,
  wide = false,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-600 to-blue-500 p-4">
      <div className={cn('bg-white rounded-2xl shadow-xl p-6 sm:p-8 w-full', wide ? 'max-w-lg' : 'max-w-sm')}>
        <h1 className={cn('text-2xl font-bold text-center text-purple-700', subtitle ? 'mb-1' : 'mb-5')}>{title}</h1>
        {subtitle && <p className="text-center text-gray-500 mb-5 text-sm">{subtitle}</p>}
        {children}
      </div>
    </div>
  );
}
