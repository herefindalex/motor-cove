export class ProjectionIntegrityError extends Error {
  constructor(
    readonly entity: 'sale' | 'payment-claim',
    readonly entityId: string,
    readonly eventKind: string,
    readonly missingPrerequisite: string,
  ) {
    super(
      `PROJECTOR_INTEGRITY: ${eventKind} requires ${missingPrerequisite} for ${entity} ${entityId}`,
    );
    this.name = 'ProjectionIntegrityError';
  }
}
