import { useState } from 'react';

/** Pile de curseurs pour une pagination précédent/suivant (curseur serveur). */
export function useCursorStack() {
  const [stack, setStack] = useState<string[]>([]);
  return {
    cursor: stack[stack.length - 1],
    reset: () => setStack([]),
    pagerProps: (nextCursor: string | null | undefined) => ({
      hasPrevious: stack.length > 0,
      hasNext: !!nextCursor,
      onPrevious: () => setStack((s) => s.slice(0, -1)),
      onNext: () => {
        if (nextCursor) setStack((s) => [...s, nextCursor]);
      },
    }),
  };
}
