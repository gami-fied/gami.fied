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
