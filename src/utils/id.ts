/**
 * ID тренировки: время в base36 и случайный хвост. Уникален в пределах одного
 * телефона, и этого достаточно: данные никуда с него не уходят.
 */
export function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
