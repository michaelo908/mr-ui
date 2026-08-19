export type RevisionedPersistenceCoordinator = {
  enqueue<T>(operation: () => Promise<T>): Promise<T>;
  drain(): Promise<void>;
};

export function createRevisionedPersistenceCoordinator(): RevisionedPersistenceCoordinator {
  let tail: Promise<unknown> = Promise.resolve();

  return {
    enqueue<T>(operation: () => Promise<T>) {
      const next = tail.catch(() => undefined).then(operation);
      tail = next;
      return next;
    },
    async drain() {
      await tail.catch(() => undefined);
    },
  };
}
