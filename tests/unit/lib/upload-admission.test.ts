import { describe, expect, it } from 'vitest';
import {
  createUploadAdmissionService,
  type IUploadReservationLease,
  type TUploadAdmissionResult,
} from '@/lib/upload-admission';

const MAX_ACTIVE_UPLOADS = 8;
const MAX_RESERVED_UPLOAD_BYTES = 200 * 1024 * 1024;

const expectAdmitted = (result: TUploadAdmissionResult): IUploadReservationLease => {
  expect(result.admitted).toBe(true);
  if (!result.admitted) throw new Error(`Upload admission rejected: ${result.reason}`);
  return result.lease;
};

describe('upload admission service', () => {
  it('admits exactly eight active uploads and rejects the ninth immediately', () => {
    const service = createUploadAdmissionService();
    const results = Array.from(
      { length: MAX_ACTIVE_UPLOADS },
      () => service.reserve(1),
    );
    const leases = results.map(expectAdmitted);

    expect(new Set(leases.map((lease) => lease.ownerId))).toHaveLength(MAX_ACTIVE_UPLOADS);
    expect(leases.every((lease) => !lease.signal.aborted)).toBe(true);
    expect(service.reserve(1)).toEqual({
      admitted: false,
      statusCode: 429,
      reason: 'upload-capacity-exhausted',
    });
    expect(service.getSnapshot()).toEqual({
      activeUploads: MAX_ACTIVE_UPLOADS,
      reservedBytes: MAX_ACTIVE_UPLOADS,
      shuttingDown: false,
    });
  });

  it('admits the exact byte budget and rejects any excess', () => {
    const service = createUploadAdmissionService();
    const lease = expectAdmitted(service.reserve(MAX_RESERVED_UPLOAD_BYTES));

    expect(service.reserve(1)).toEqual({
      admitted: false,
      statusCode: 429,
      reason: 'upload-capacity-exhausted',
    });
    expect(service.getSnapshot()).toMatchObject({
      activeUploads: 1,
      reservedBytes: MAX_RESERVED_UPLOAD_BYTES,
    });

    lease.release();
  });

  it('rejects a reservation that would cross the byte budget without consuming capacity', () => {
    const service = createUploadAdmissionService();
    const first = expectAdmitted(service.reserve(MAX_RESERVED_UPLOAD_BYTES - 1));

    expect(service.reserve(2)).toEqual({
      admitted: false,
      statusCode: 429,
      reason: 'upload-capacity-exhausted',
    });
    const exactBoundary = expectAdmitted(service.reserve(1));
    expect(service.getSnapshot()).toMatchObject({
      activeUploads: 2,
      reservedBytes: MAX_RESERVED_UPLOAD_BYTES,
    });

    first.release();
    exactBoundary.release();
  });

  it('releases count and byte capacity for immediate re-admission', () => {
    const service = createUploadAdmissionService();
    const first = expectAdmitted(service.reserve(MAX_RESERVED_UPLOAD_BYTES));

    first.release();

    const replacement = expectAdmitted(service.reserve(MAX_RESERVED_UPLOAD_BYTES));
    expect(replacement.ownerId).not.toBe(first.ownerId);
    expect(service.getSnapshot()).toEqual({
      activeUploads: 1,
      reservedBytes: MAX_RESERVED_UPLOAD_BYTES,
      shuttingDown: false,
    });
  });

  it('makes repeated lease release idempotent without undercounting capacity', () => {
    const service = createUploadAdmissionService();
    const first = expectAdmitted(service.reserve(100 * 1024 * 1024));

    first.release();
    first.release();
    first.release();

    expect(service.getSnapshot()).toEqual({
      activeUploads: 0,
      reservedBytes: 0,
      shuttingDown: false,
    });
    expectAdmitted(service.reserve(MAX_RESERVED_UPLOAD_BYTES));
    expect(service.reserve(1)).toEqual({
      admitted: false,
      statusCode: 429,
      reason: 'upload-capacity-exhausted',
    });
  });

  it('aborts every active lease and releases each reservation once during re-entrant shutdown', () => {
    const service = createUploadAdmissionService();
    const first = expectAdmitted(service.reserve(80 * 1024 * 1024));
    const second = expectAdmitted(service.reserve(120 * 1024 * 1024));

    first.signal.addEventListener('abort', () => {
      first.release();
      second.release();
      service.shutdown();
    }, { once: true });

    service.shutdown();
    service.shutdown();
    first.release();
    second.release();

    expect(first.signal.aborted).toBe(true);
    expect(second.signal.aborted).toBe(true);
    expect(first.signal.reason).toBe('upload-server-shutting-down');
    expect(second.signal.reason).toBe('upload-server-shutting-down');
    expect(service.getSnapshot()).toEqual({
      activeUploads: 0,
      reservedBytes: 0,
      shuttingDown: true,
    });
  });

  it('rejects new reservations after shutdown', () => {
    const service = createUploadAdmissionService();

    service.shutdown();

    expect(service.reserve(1)).toEqual({
      admitted: false,
      statusCode: 503,
      reason: 'upload-server-shutting-down',
    });
  });

  it.each([
    0,
    -1,
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    Number.MAX_SAFE_INTEGER + 1,
  ])('fails closed for invalid declared byte count %s', (declaredBytes) => {
    const service = createUploadAdmissionService();

    expect(service.reserve(declaredBytes)).toEqual({
      admitted: false,
      statusCode: 429,
      reason: 'upload-capacity-exhausted',
    });
    expect(service.getSnapshot()).toEqual({
      activeUploads: 0,
      reservedBytes: 0,
      shuttingDown: false,
    });
  });

  it('returns a frozen diagnostic snapshot with no owner or signal data', () => {
    const service = createUploadAdmissionService();
    expectAdmitted(service.reserve(1024));

    const snapshot = service.getSnapshot();

    expect(Object.keys(snapshot).sort()).toEqual([
      'activeUploads',
      'reservedBytes',
      'shuttingDown',
    ]);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(snapshot).not.toHaveProperty('ownerId');
    expect(snapshot).not.toHaveProperty('signal');
  });
});
