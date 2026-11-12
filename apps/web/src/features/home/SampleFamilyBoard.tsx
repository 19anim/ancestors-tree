import { useTranslation } from 'react-i18next';
import {
  Board,
  DateMark,
  midpoint,
  pinPoint,
  Polaroid,
  POLAROID_SIZE,
  Stitch,
  stitchEnds,
  THREAD_DROP,
  Thread,
  tiltFor,
} from '../../shared/ui';
import {
  SAMPLE_BOARD,
  SAMPLE_CHILDREN,
  SAMPLE_MARRIAGES,
  SAMPLE_PEOPLE,
  type SamplePerson,
} from './sampleFamily';

const CARD = POLAROID_SIZE.full;

function personById(id: string): SamplePerson {
  const person = SAMPLE_PEOPLE.find((candidate) => candidate.id === id);
  if (!person) throw new Error(`Unknown sample person "${id}"`);
  return person;
}

export function SampleFamilyBoard() {
  const { t } = useTranslation();

  return (
    <Board width={SAMPLE_BOARD.width} height={SAMPLE_BOARD.height} label={t('home.boardLabel')}>
      <svg
        aria-hidden="true"
        className="absolute inset-0"
        width={SAMPLE_BOARD.width}
        height={SAMPLE_BOARD.height}
      >
        {/* Threads first, so the stitch knots sit on top of where threads start. */}
        {SAMPLE_CHILDREN.map(({ child, parents: [a, b] }) => {
          const first = personById(a);
          const second = personById(b);
          const { left, right } = stitchEnds(first, second, CARD);
          return (
            <Thread
              key={child}
              from={midpoint(left, right)}
              dropTo={Math.max(first.y, second.y) + CARD.height + THREAD_DROP}
              to={pinPoint(personById(child), CARD)}
            />
          );
        })}
        {SAMPLE_MARRIAGES.map(([a, b]) => {
          const { left, right } = stitchEnds(personById(a), personById(b), CARD);
          return <Stitch key={`${a}+${b}`} left={left} right={right} />;
        })}
      </svg>

      {SAMPLE_PEOPLE.map((person) => (
        <Polaroid
          key={person.id}
          className="absolute"
          style={{ left: person.x, top: person.y }}
          name={person.name}
          label={t('scrapbook.personLabel', { name: person.name, years: person.years })}
          lifeYears={person.years}
          tape={person.tape}
          tilt={tiltFor(person.id)}
          dateLine={
            person.deathAnniversary ? (
              <DateMark
                kind="death-anniversary"
                label={t('scrapbook.deathAnniversaryLabel', { date: person.deathAnniversary })}
              >
                {t('scrapbook.deathAnniversary', { date: person.deathAnniversary })}
              </DateMark>
            ) : undefined
          }
          marks={
            person.birthday ? (
              <DateMark kind="birthday" label={t('scrapbook.birthday', { date: person.birthday })}>
                {person.birthday}
              </DateMark>
            ) : undefined
          }
        />
      ))}
    </Board>
  );
}
