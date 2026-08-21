export interface IUploadReservationLease {
  ownerId: symbol;
  signal: AbortSignal;
  release: () => void;
}

export interface IUploadAdmissionSnapshot {
  readonly activeUploads: number;
  readonly reservedBytes: number;
  readonly shuttingDown: boolean;
}

export interface IUploadAdmissionService {
  reserve: (declaredBytes: number) => TUploadAdmissionResult;
  shutdown: () => void;
}

export interface IUploadAdmissionDiagnostics {
  getSnapshot: () => IUploadAdmissionSnapshot;
}

export type TUploadAdmissionResult =
  | { admitted: true; lease: IUploadReservationLease }
  | {
      admitted: false;
      statusCode: 429 | 503;
      reason: 'upload-capacity-exhausted' | 'upload-server-shutting-down';
    };

interface IUploadReservationRecord {
  declaredBytes: number;
  controller: AbortController;
  release: () => void;
}

const DEFAULT_MAX_ACTIVE_UPLOADS = 8;
const DEFAULT_MAX_RESERVED_UPLOAD_BYTES = 200 * 1024 * 1024;

const capacityExhausted = (): TUploadAdmissionResult => ({
  admitted: false,
  statusCode: 429,
  reason: 'upload-capacity-exhausted',
});

const serverShuttingDown = (): TUploadAdmissionResult => ({
  admitted: false,
  statusCode: 503,
  reason: 'upload-server-shutting-down',
});

export const createUploadAdmissionService = (
): IUploadAdmissionService & IUploadAdmissionDiagnostics => {
  const reservations = new Map<symbol, IUploadReservationRecord>();
  let reservedBytes = 0;
  let shuttingDown = false;

  const reserve = (declaredBytes: number): TUploadAdmissionResult => {
    if (shuttingDown) return serverShuttingDown();
    if (!Number.isSafeInteger(declaredBytes) || declaredBytes <= 0) {
      return capacityExhausted();
    }
    if (
      reservations.size >= DEFAULT_MAX_ACTIVE_UPLOADS
      || declaredBytes > DEFAULT_MAX_RESERVED_UPLOAD_BYTES - reservedBytes
    ) {
      return capacityExhausted();
    }

    const ownerId = Symbol('upload-reservation');
    const controller = new AbortController();
    let released = false;
    const release = (): void => {
      if (released) return;
      released = true;
      const reservation = reservations.get(ownerId);
      if (!reservation) return;
      reservations.delete(ownerId);
      reservedBytes -= reservation.declaredBytes;
    };
    reservations.set(ownerId, { declaredBytes, controller, release });
    reservedBytes += declaredBytes;

    return {
      admitted: true,
      lease: {
        ownerId,
        signal: controller.signal,
        release,
      },
    };
  };

  const shutdown = (): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    const activeReservations = [...reservations.values()];
    for (const reservation of activeReservations) {
      reservation.controller.abort('upload-server-shutting-down');
      reservation.release();
    }
  };

  const getSnapshot = (): IUploadAdmissionSnapshot => Object.freeze({
    activeUploads: reservations.size,
    reservedBytes,
    shuttingDown,
  });

  return { reserve, shutdown, getSnapshot };
};
