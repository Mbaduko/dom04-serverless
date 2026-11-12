import { HttpError } from "./helper.mjs";

export const STATUSES = ["TODO", "IN_PROGRESS", "DONE"];
export const PRIORITIES = ["LOW", "MEDIUM", "HIGH"];

const fail = (message) => {
  throw new HttpError(400, "VALIDATION_ERROR", message);
};

const optionalString = (value, field, max) => {
  if (value === undefined) return undefined;
  if (typeof value !== "string") fail(`${field} must be a string`);
  const trimmed = value.trim();
  if (trimmed.length > max) fail(`${field} must be at most ${max} characters`);
  return trimmed;
};

export const optionalEnum = (value, field, allowed) => {
  if (value === undefined) return undefined;
  if (!allowed.includes(value)) fail(`${field} must be one of: ${allowed.join(", ")}`);
  return value;
};

const optionalDate = (value, field) => {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    fail(`${field} must be an ISO date, e.g. 2026-11-20T09:00:00Z`);
  }
  return new Date(value).toISOString();
};

export const validateNewTask = (body) => {
  const title = optionalString(body.title, "title", 200);
  if (!title) fail("title is required");

  return {
    title,
    description: optionalString(body.description, "description", 2000),
    priority: optionalEnum(body.priority, "priority", PRIORITIES) ?? "MEDIUM",
    deadline: optionalDate(body.deadline, "deadline"),
  };
};

const ADMIN_EDITABLE = ["title", "description", "priority", "deadline", "status"];
const MEMBER_EDITABLE = ["status"];

export const validateTaskUpdate = (body, isAdmin) => {
  const allowed = isAdmin ? ADMIN_EDITABLE : MEMBER_EDITABLE;
  const fields = Object.keys(body);

  if (fields.length === 0) fail("Provide at least one field to update");

  const forbidden = fields.filter((field) => !allowed.includes(field));
  if (forbidden.length > 0) {
    if (!isAdmin && forbidden.every((field) => ADMIN_EDITABLE.includes(field))) {
      throw new HttpError(403, "FORBIDDEN", "Team members can only update the status");
    }
    fail(`Unknown or read-only fields: ${forbidden.join(", ")}`);
  }

  const changes = {
    title: optionalString(body.title, "title", 200),
    description: optionalString(body.description, "description", 2000),
    priority: optionalEnum(body.priority, "priority", PRIORITIES),
    deadline: optionalDate(body.deadline, "deadline"),
    status: optionalEnum(body.status, "status", STATUSES),
  };
  if (changes.title === "") fail("title cannot be empty");

  return Object.fromEntries(Object.entries(changes).filter(([, value]) => value !== undefined));
};

export const validateNewUser = (body, roles) => {
  const email = optionalString(body.email, "email", 254)?.toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail("A valid email is required");

  return {
    email,
    name: optionalString(body.name, "name", 100),
    role: optionalEnum(body.role, "role", roles) ?? "TeamMember",
  };
};
