import { ReminderKind } from '@missas/shared';
import {
  planReminders,
  buildReminderMessage,
  civilDaysBetween,
  timeToMinutes,
  type SpClock,
  type ReminderConfig,
  type ReminderCandidate,
} from './reminder-plan';

const CONFIG: ReminderConfig = {
  reminderEveHour: 18,
  reminderSameDayHoursBefore: 3,
  reminderGroupSummaryDaysBefore: 3,
};

function candidate(over: Partial<ReminderCandidate> = {}): ReminderCandidate {
  return {
    assignmentId: 'a1',
    parishId: 'p1',
    teamId: 't1',
    teamName: 'Coroinhas',
    teamWhatsappGroupId: 'grp1',
    functionName: 'Cruz',
    memberId: 'm1',
    memberName: 'Ana Maria',
    memberPhone: '11999990000',
    occurrenceId: 'o1',
    occurrenceDate: '2026-07-12',
    occurrenceTime: '10:00',
    ...over,
  };
}

describe('civilDaysBetween', () => {
  it('conta dias civis (b - a)', () => {
    expect(civilDaysBetween('2026-07-09', '2026-07-12')).toBe(3);
    expect(civilDaysBetween('2026-07-12', '2026-07-12')).toBe(0);
    expect(civilDaysBetween('2026-07-13', '2026-07-12')).toBe(-1);
  });
  it('atravessa virada de mes', () => {
    expect(civilDaysBetween('2026-07-31', '2026-08-01')).toBe(1);
  });
});

describe('timeToMinutes', () => {
  it('converte HH:mm', () => {
    expect(timeToMinutes('10:00')).toBe(600);
    expect(timeToMinutes('00:00')).toBe(0);
    expect(timeToMinutes('23:59')).toBe(1439);
  });
  it('rejeita malformado', () => {
    expect(timeToMinutes('25:00')).toBeNull();
    expect(timeToMinutes('abc')).toBeNull();
  });
});

describe('planReminders — janelas', () => {
  it('resumo de grupo N dias antes (1 por equipe+dia)', () => {
    const clock: SpClock = { dateStr: '2026-07-09', minutes: 9 * 60 }; // 3 dias antes
    const planned = planReminders(clock, CONFIG, [candidate()]);
    const group = planned.filter((p) => p.kind === ReminderKind.GROUP_SUMMARY);
    expect(group).toHaveLength(1);
    expect(group[0].targetKey).toBe('t1:2026-07-12');
    expect(group[0].to).toBe('grp1');
    expect(group[0].recipientKind).toBe('GROUP');
  });

  it('varias missas da equipe no mesmo dia colapsam em 1 resumo', () => {
    const clock: SpClock = { dateStr: '2026-07-09', minutes: 9 * 60 };
    const planned = planReminders(clock, CONFIG, [
      candidate({ assignmentId: 'a1', occurrenceId: 'o1', occurrenceTime: '08:00' }),
      candidate({ assignmentId: 'a2', occurrenceId: 'o2', occurrenceTime: '19:00' }),
    ]);
    expect(planned.filter((p) => p.kind === ReminderKind.GROUP_SUMMARY)).toHaveLength(1);
  });

  it('lembrete de vespera a partir da hora configurada', () => {
    const eve: SpClock = { dateStr: '2026-07-11', minutes: 18 * 60 };
    const planned = planReminders(eve, CONFIG, [candidate()]);
    const ind = planned.filter((p) => p.kind === ReminderKind.INDIVIDUAL_EVE);
    expect(ind).toHaveLength(1);
    expect(ind[0].targetKey).toBe('a1');
    expect(ind[0].to).toBe('11999990000');
  });

  it('nao manda vespera antes da hora configurada', () => {
    const early: SpClock = { dateStr: '2026-07-11', minutes: 17 * 60 + 59 };
    const planned = planReminders(early, CONFIG, [candidate()]);
    expect(planned.filter((p) => p.kind === ReminderKind.INDIVIDUAL_EVE)).toHaveLength(0);
  });

  it('lembrete no dia a partir de N horas antes da missa', () => {
    const sameDay: SpClock = { dateStr: '2026-07-12', minutes: 7 * 60 }; // missa 10:00, 3h antes = 07:00
    const planned = planReminders(sameDay, CONFIG, [candidate()]);
    expect(planned.filter((p) => p.kind === ReminderKind.INDIVIDUAL_DAY)).toHaveLength(1);
  });

  it('nao manda no dia antes da janela de N horas', () => {
    const tooEarly: SpClock = { dateStr: '2026-07-12', minutes: 6 * 60 + 59 };
    const planned = planReminders(tooEarly, CONFIG, [candidate()]);
    expect(planned.filter((p) => p.kind === ReminderKind.INDIVIDUAL_DAY)).toHaveLength(0);
  });

  it('lembrete no dia desligado quando sameDayHoursBefore = null', () => {
    const sameDay: SpClock = { dateStr: '2026-07-12', minutes: 8 * 60 };
    const planned = planReminders(
      sameDay,
      { ...CONFIG, reminderSameDayHoursBefore: null },
      [candidate()],
    );
    expect(planned.filter((p) => p.kind === ReminderKind.INDIVIDUAL_DAY)).toHaveLength(0);
  });

  it('nunca lembra missa no passado', () => {
    const after: SpClock = { dateStr: '2026-07-13', minutes: 9 * 60 };
    const planned = planReminders(after, CONFIG, [candidate()]);
    expect(planned).toHaveLength(0);
  });

  it('EVE e DAY do mesmo assignment coexistem (kinds distintos)', () => {
    // EVE (vespera) e DAY (no dia) sao ticks diferentes; aqui so garantimos que
    // o targetKey (assignmentId) e igual mas o kind separa — dedupe por (kind,key).
    const eve = planReminders({ dateStr: '2026-07-11', minutes: 18 * 60 }, CONFIG, [candidate()]);
    const day = planReminders({ dateStr: '2026-07-12', minutes: 8 * 60 }, CONFIG, [candidate()]);
    expect(eve[0].targetKey).toBe('a1');
    expect(day.find((p) => p.kind === ReminderKind.INDIVIDUAL_DAY)?.targetKey).toBe('a1');
  });

  it('propaga destino nulo (sem telefone) para o service pular', () => {
    const eve: SpClock = { dateStr: '2026-07-11', minutes: 18 * 60 };
    const planned = planReminders(eve, CONFIG, [candidate({ memberPhone: null })]);
    const ind = planned.find((p) => p.kind === ReminderKind.INDIVIDUAL_EVE);
    expect(ind?.to).toBeNull();
  });
});

describe('buildReminderMessage', () => {
  const link = 'https://portal.exemplo/p/paroquia/escala/entrar';

  it('mensagem de grupo cita equipe, data e link do portal', () => {
    const [group] = planReminders(
      { dateStr: '2026-07-09', minutes: 9 * 60 },
      CONFIG,
      [candidate()],
    ).filter((p) => p.kind === ReminderKind.GROUP_SUMMARY);
    const msg = buildReminderMessage(group, link);
    expect(msg).toContain('Coroinhas');
    expect(msg).toContain('12/07');
    expect(msg).toContain(link);
  });

  it('mensagem individual cita missa, hora, funcao e link', () => {
    const [ind] = planReminders(
      { dateStr: '2026-07-11', minutes: 18 * 60 },
      CONFIG,
      [candidate()],
    ).filter((p) => p.kind === ReminderKind.INDIVIDUAL_EVE);
    const msg = buildReminderMessage(ind, link);
    expect(msg).toContain('Ana'); // primeiro nome
    expect(msg).toContain('12/07');
    expect(msg).toContain('10:00');
    expect(msg).toContain('Cruz');
    expect(msg).toContain(link);
  });
});
