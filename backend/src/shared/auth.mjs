import { HttpError } from "./helper.mjs";

export const ROLES = { ADMIN: "Admin", TEAM_MEMBER: "TeamMember" };

const parseGroups = (raw) => {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  return String(raw).replace(/[[\]]/g, "").split(/[,\s]+/).filter(Boolean);
};

export const getUser = (event) => {
  const claims = event.requestContext?.authorizer?.claims;
  if (!claims?.sub) throw new HttpError(401, "UNAUTHORIZED", "Missing user identity");

  const groups = parseGroups(claims["cognito:groups"]);
  return {
    sub: claims.sub,
    email: claims.email,
    groups,
    isAdmin: groups.includes(ROLES.ADMIN),
  };
};

export const requireAdmin = (user) => {
  if (!user.isAdmin) throw new HttpError(403, "FORBIDDEN", "Only admins can perform this action");
};
