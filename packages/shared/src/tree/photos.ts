import type { Op, SingleOp } from './ops.ts';
import type { PersonPhoto } from './schemas.ts';

export interface PhotoInOp {
  personId: string;
  photo: PersonPhoto;
}

function fromSingle(op: SingleOp): PhotoInOp[] {
  switch (op.type) {
    case 'addPerson':
      return op.payload.photo ? [{ personId: op.payload.id, photo: op.payload.photo }] : [];
    case 'updatePerson': {
      const photo = op.payload.changes.photo;
      return photo ? [{ personId: op.payload.id, photo }] : [];
    }
    case 'restorePerson': {
      const { person } = op.payload;
      return person.photo ? [{ personId: person.id, photo: person.photo }] : [];
    }
    default:
      return [];
  }
}

/** Every photo an op sets, so the server can check each one (spec §12, verified on save). */
export function photosInOp(op: Op): PhotoInOp[] {
  return op.type === 'batch' ? op.payload.ops.flatMap(fromSingle) : fromSingle(op);
}
