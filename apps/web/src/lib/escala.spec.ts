import {
  splitCandidates,
  buildPersonPanel,
  formatOccurrenceDate,
  conflictLabel,
  weekdayOf,
  affectedLabel,
  availabilityView,
  availabilityOrigin,
  weekStartOf,
  weekRangeLabel,
  monthLabel,
  formatRowDay,
  shiftMonth,
  groupIntoWeeks,
  isDayWideAvailable,
  dayWideAvailableWeekdays,
  type GridCandidate,
  type GridOccurrence,
  type PortalOccurrence,
  type PortalRule,
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

describe('weekdayOf (S2.1)', () => {
  it('deriva o dia da semana (base UTC) da data civil', () => {
    expect(weekdayOf('2026-07-05')).toBe(0); // domingo
    expect(weekdayOf('2026-07-08')).toBe(3); // quarta
  });
});

describe('affectedLabel (S2.1)', () => {
  it('descreve escala e disponibilidade que serão perdidas', () => {
    expect(
      affectedLabel({ assignmentCount: 3, publishedAssignmentCount: 0, availabilityCount: 5 }),
    ).toBe('3 escalado(s) e 5 resposta(s) de disponibilidade');
  });

  it('destaca os já publicados', () => {
    expect(
      affectedLabel({ assignmentCount: 2, publishedAssignmentCount: 2, availabilityCount: 0 }),
    ).toBe('2 escalado(s) (2 já publicado(s))');
  });

  it('só disponibilidade', () => {
    expect(
      affectedLabel({ assignmentCount: 0, publishedAssignmentCount: 0, availabilityCount: 4 }),
    ).toBe('4 resposta(s) de disponibilidade');
  });
});

// ── Portal de disponibilidade (S6 / redesign) ────────────────────────────────

function occ(over: Partial<PortalOccurrence>): PortalOccurrence {
  return {
    id: 'o',
    date: '2026-07-08',
    time: '19:00',
    title: null,
    isSolemnity: false,
    availability: { status: 'UNAVAILABLE', source: 'default' },
    ...over,
  };
}

describe('availabilityView — três estados distintos (R5)', () => {
  it('sem resposta (default) → unanswered, mesmo resolvendo indisponível', () => {
    expect(
      availabilityView({ status: 'UNAVAILABLE', source: 'default' }),
    ).toBe('unanswered');
  });

  it('indisponível marcado é distinto de sem resposta', () => {
    expect(
      availabilityView({ status: 'UNAVAILABLE', source: 'explicit' }),
    ).toBe('unavailable');
    expect(
      availabilityView({ status: 'UNAVAILABLE', source: 'rule' }),
    ).toBe('unavailable');
  });

  it('disponível (regra ou manual) → available', () => {
    expect(
      availabilityView({ status: 'AVAILABLE', source: 'rule' }),
    ).toBe('available');
    expect(
      availabilityView({ status: 'AVAILABLE', source: 'explicit' }),
    ).toBe('available');
  });
});

describe('availabilityOrigin — copy na voz do produto', () => {
  it('mapeia cada origem', () => {
    expect(availabilityOrigin('rule')).toBe('Pela sua regra');
    expect(availabilityOrigin('explicit')).toBe('Você marcou');
    expect(availabilityOrigin('default')).toBe('Sem resposta');
  });
});

describe('weekStartOf — semana começa no domingo', () => {
  it('quarta 08/07/2026 → domingo 05/07', () => {
    expect(weekStartOf('2026-07-08')).toBe('2026-07-05');
  });
  it('domingo devolve o próprio dia', () => {
    expect(weekStartOf('2026-07-05')).toBe('2026-07-05');
  });
  it('sábado 11/07 ainda pertence à semana de 05/07', () => {
    expect(weekStartOf('2026-07-11')).toBe('2026-07-05');
  });
});

describe('weekRangeLabel / monthLabel / formatRowDay', () => {
  it('semana no mesmo mês', () => {
    expect(weekRangeLabel('2026-07-05', '2026-07-11')).toBe('5 a 11 de julho');
  });
  it('semana que vira o mês', () => {
    expect(weekRangeLabel('2026-06-28', '2026-07-04')).toBe(
      '28 de junho a 4 de julho',
    );
  });
  it('rótulo do mês', () => {
    expect(monthLabel('2026-07')).toBe('julho de 2026');
  });
  it('cabeçalho compacto da linha', () => {
    expect(formatRowDay('2026-07-08')).toEqual({ abbr: 'Qua', label: '08/07' });
  });
});

describe('shiftMonth — vizinho, atravessa o ano', () => {
  it('avança e recua', () => {
    expect(shiftMonth('2026-07', 1)).toBe('2026-08');
    expect(shiftMonth('2026-07', -1)).toBe('2026-06');
  });
  it('vira o ano', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
  });
});

describe('groupIntoWeeks — navegação semana a semana (R2)', () => {
  it('agrupa por semana, conta sem-resposta e só inclui semanas com missa', () => {
    const weeks = groupIntoWeeks([
      occ({ id: 'a', date: '2026-07-05', availability: { status: 'AVAILABLE', source: 'rule' } }),
      occ({ id: 'b', date: '2026-07-08' }), // default → sem resposta
      occ({ id: 'c', date: '2026-07-12' }), // próxima semana (dom 12)
    ]);
    expect(weeks).toHaveLength(2);
    expect(weeks[0].start).toBe('2026-07-05');
    expect(weeks[0].end).toBe('2026-07-11');
    expect(weeks[0].occurrences.map((o) => o.id)).toEqual(['a', 'b']);
    expect(weeks[0].unanswered).toBe(1);
    expect(weeks[0].label).toBe('5 a 11 de julho');
    expect(weeks[1].start).toBe('2026-07-12');
    expect(weeks[1].occurrences.map((o) => o.id)).toEqual(['c']);
  });

  it('lista vazia → nenhuma semana', () => {
    expect(groupIntoWeeks([])).toEqual([]);
  });
});

describe('regras "sempre disponível" (protagonista R1)', () => {
  const rules: PortalRule[] = [
    { weekday: 0, time: null, available: true }, // domingo dia inteiro → chip
    { weekday: 3, time: null, available: true }, // quarta dia inteiro → chip
    { weekday: 0, time: '10:00', available: true }, // horário específico → não é chip
    { weekday: 5, time: null, available: false }, // dia inteiro indisponível → não é chip
  ];

  it('isDayWideAvailable distingue o chip do ajuste fino', () => {
    expect(isDayWideAvailable(rules[0])).toBe(true);
    expect(isDayWideAvailable(rules[2])).toBe(false);
    expect(isDayWideAvailable(rules[3])).toBe(false);
  });

  it('dayWideAvailableWeekdays devolve só os dias dos chips', () => {
    expect([...dayWideAvailableWeekdays(rules)].sort()).toEqual([0, 3]);
  });
});
