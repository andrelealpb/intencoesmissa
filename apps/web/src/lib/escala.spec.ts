import {
  splitCandidates,
  buildPersonPanel,
  formatOccurrenceDate,
  conflictLabel,
  type GridCandidate,
  type GridOccurrence,
} from './escala';

function candidate(over: Partial<GridCandidate>): GridCandidate {
  return {
    memberId: 'm',
    memberName: 'Alguém',
    available: true,
    availabilitySource: 'default',
    assignmentsInTeamMonth: 0,
    maxAssignmentsPerMonth: null,
    atCap: false,
    alreadyInOccurrence: false,
    eligible: true,
    reason: null,
    conflict: null,
    ...over,
  };
}

describe('splitCandidates', () => {
  it('particiona elegíveis e excluídos preservando a ordem do backend', () => {
    const list: GridCandidate[] = [
      candidate({ memberId: 'a', memberName: 'Ana', eligible: true }),
      candidate({ memberId: 'b', memberName: 'Bia', eligible: true }),
      candidate({
        memberId: 'c',
        memberName: 'Caio',
        eligible: false,
        reason: 'INDISPONIVEL',
        available: false,
      }),
      candidate({
        memberId: 'd',
        memberName: 'Davi',
        eligible: false,
        reason: 'NO_TETO',
        atCap: true,
      }),
    ];
    const { eligible, excluded } = splitCandidates(list);
    expect(eligible.map((c) => c.memberId)).toEqual(['a', 'b']);
    expect(excluded.map((c) => c.memberId)).toEqual(['c', 'd']);
  });

  it('lida com listas vazias', () => {
    expect(splitCandidates([])).toEqual({ eligible: [], excluded: [] });
  });
});

describe('conflictLabel', () => {
  it('formata a contenda cruzada (V3) com equipe e horário', () => {
    const label = conflictLabel(
      { teamId: 't', teamName: 'MESC', functionId: 'f', functionName: 'Ministro' },
      '10:00',
    );
    expect(label).toBe('já na MESC, 10:00');
  });
});

describe('formatOccurrenceDate', () => {
  it('monta "Dom 02/08" a partir de YYYY-MM-DD e weekday', () => {
    expect(formatOccurrenceDate('2026-08-02', 0)).toBe('Dom 02/08');
    expect(formatOccurrenceDate('2026-08-05', 3)).toBe('Qua 05/08');
  });
});

describe('buildPersonPanel', () => {
  const occurrences: GridOccurrence[] = [
    {
      occurrenceId: 'o1',
      date: '2026-08-02',
      time: '10:00',
      weekday: 0,
      isSolemnity: false,
      slots: [
        {
          functionId: 'f1',
          functionName: 'Turíbulo',
          required: 2,
          filled: 1,
          missing: 1,
          assignments: [
            {
              assignmentId: 'a1',
              memberId: 'ana',
              memberName: 'Ana',
              status: 'SCHEDULED',
              published: false,
              overrideReason: null,
            },
          ],
          gap: null,
          // Bia é qualificada, ainda não escalada → deve aparecer com 0.
          candidates: [
            candidate({ memberId: 'bia', memberName: 'Bia' }),
          ],
        },
      ],
    },
    {
      occurrenceId: 'o2',
      date: '2026-08-09',
      time: '19:00',
      weekday: 0,
      isSolemnity: false,
      slots: [
        {
          functionId: 'f1',
          functionName: 'Turíbulo',
          required: 1,
          filled: 1,
          missing: 0,
          assignments: [
            {
              assignmentId: 'a2',
              memberId: 'ana',
              memberName: 'Ana',
              status: 'SCHEDULED',
              published: true,
              overrideReason: null,
            },
          ],
          gap: null,
          candidates: [],
        },
      ],
    },
  ];

  it('tabula contagem e datas por pessoa, ordenando por carga desc', () => {
    const panel = buildPersonPanel(occurrences);
    expect(panel.map((p) => [p.memberId, p.count])).toEqual([
      ['ana', 2],
      ['bia', 0],
    ]);
    const ana = panel.find((p) => p.memberId === 'ana')!;
    expect(ana.services).toEqual([
      { date: '2026-08-02', time: '10:00', functionName: 'Turíbulo' },
      { date: '2026-08-09', time: '19:00', functionName: 'Turíbulo' },
    ]);
  });

  it('inclui qualificados sem serviço (candidatos com 0)', () => {
    const bia = buildPersonPanel(occurrences).find((p) => p.memberId === 'bia')!;
    expect(bia.count).toBe(0);
    expect(bia.services).toEqual([]);
  });
});
