export function formatDateOnly(value: string | null | undefined) {
  if (!value) {
    return "Nie podano";
  }

  const [year, month, day] = value.split("-");
  return `${day}.${month}.${year}`;
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "Nie podano";
  }

  return new Intl.DateTimeFormat("pl-PL", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

export function emptyAsNull(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}
