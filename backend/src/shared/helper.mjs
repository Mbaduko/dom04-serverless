export const respond = (statusCode, body) => {
  const response = {
    statusCode,
    headers: { "Content-Type": "application/json" },
  };
  if (body !== undefined) response.body = JSON.stringify(body);
  return response;
};

export class HttpError extends Error {
  constructor(statusCode, code, message) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

export const errorResponse = (err) => {
  if (err instanceof HttpError) {
    return respond(err.statusCode, {
      error: { code: err.code, message: err.message },
    });
  }
  console.error("Unexpected error:", err);
  return respond(500, {
    error: { code: "INTERNAL_ERROR", message: "Something went wrong" },
  });
};

export const readBody = (event) => {
  if (!event.body) return {};
  const raw = event.isBase64Encoded
    ? Buffer.from(event.body, "base64").toString("utf8")
    : event.body;
  try {
    return JSON.parse(raw);
  } catch (error) {
    console.error("Invalid JSON::", error)
    throw new HttpError(400, "INVALID_JSON", "Request body must be valid JSON");
  }
};
