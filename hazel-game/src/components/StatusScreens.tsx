import { motion } from 'framer-motion';

/** Full-screen loading state with an animated spinner. */
export function LoadingScreen({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-indigo-500 to-purple-600 text-white">
      <motion.div
        className="w-12 h-12 border-4 border-white/30 border-t-white rounded-full"
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, duration: 0.9, ease: 'linear' }}
      />
      <p className="mt-5 text-lg font-medium">{label}</p>
    </div>
  );
}

/** Full-screen error state with optional retry / back actions. */
export function ErrorScreen({
  message,
  onRetry,
  onBack,
}: {
  message: string;
  onRetry?: () => void;
  onBack?: () => void;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-500 to-purple-600 p-6">
      <div className="bg-white text-gray-700 rounded-2xl p-8 max-w-sm w-full text-center shadow-xl">
        <div className="text-5xl mb-3">😕</div>
        <h2 className="text-xl font-bold mb-2">Something went wrong</h2>
        <p className="text-sm text-gray-500 mb-6">{message}</p>
        <div className="flex gap-3 justify-center">
          {onRetry && (
            <button
              onClick={onRetry}
              className="bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg px-5 py-2 transition"
            >
              Try again
            </button>
          )}
          {onBack && (
            <button
              onClick={onBack}
              className="bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold rounded-lg px-5 py-2 transition"
            >
              Back
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
