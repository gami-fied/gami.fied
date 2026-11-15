const dateTime = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});
const dateOnly = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });
const timeOnly = new Intl.DateTimeFormat(undefined, { timeStyle: 'short' });

type DateInput = string | number | Date;

/** All dates use the viewer's locale and time zone. */
export const formatDateTime = (value: DateInput): string => dateTime.format(new Date(value));
export const formatDate = (value: DateInput): string => dateOnly.format(new Date(value));
export const formatTime = (value: DateInput): string => timeOnly.format(new Date(value));

/**
 * A date as a `datetime-local` field wants it: the viewer's own time, without a zone. Reading the
 * field back with `new Date(value)` gives the same moment, so editing never shifts it.
 */
export function toDateTimeLocal(value: DateInput): string {
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

/** The viewer's time zone as a short label, such as "your time, UTC+5:30". */
export function localTimeZoneLabel(): string {
  const minutes = -new Date().getTimezoneOffset();
  const sign = minutes < 0 ? '-' : '+';
  const hours = Math.floor(Math.abs(minutes) / 60);
  const rest = Math.abs(minutes) % 60;
  return `your time, UTC${sign}${hours}${rest ? `:${String(rest).padStart(2, '0')}` : ''}`;
}
