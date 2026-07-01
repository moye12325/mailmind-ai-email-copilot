export type ConnectionTransition = "none" | "lost" | "recovered";
export interface ConnectionNotification {
  title: string;
  body: string;
}

export function getConnectionTransition(
  previous: boolean | null,
  next: boolean,
): ConnectionTransition {
  if (previous === null) {
    return "none";
  }

  if (previous && !next) {
    return "lost";
  }

  if (!previous && next) {
    return "recovered";
  }

  return "none";
}

export function getConnectionNotification(
  transition: ConnectionTransition,
): ConnectionNotification | null {
  if (transition === "recovered") {
    return {
      title: "MailMind connected",
      body: "Local services are reachable again.",
    };
  }

  if (transition === "lost") {
    return {
      title: "MailMind disconnected",
      body: "Local services are no longer reachable.",
    };
  }

  return null;
}
