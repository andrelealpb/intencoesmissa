import { ZodExceptionFilter } from "./zod-exception.filter";
import { ZodError } from "zod";
import { ArgumentsHost, HttpStatus } from "@nestjs/common";

describe("ZodExceptionFilter", () => {
  let filter: ZodExceptionFilter;
  let mockResponse: { status: jest.Mock; json: jest.Mock };
  let mockHost: ArgumentsHost;

  beforeEach(() => {
    filter = new ZodExceptionFilter();
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    mockHost = {
      switchToHttp: () => ({
        getResponse: () => mockResponse,
      }),
    } as unknown as ArgumentsHost;
  });

  it("should return 400 with validation errors", () => {
    const zodError = new ZodError([
      {
        code: "invalid_type",
        expected: "string",
        received: "undefined",
        path: ["email"],
        message: "Required",
      },
    ]);

    filter.catch(zodError, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(mockResponse.json).toHaveBeenCalledWith({
      statusCode: HttpStatus.BAD_REQUEST,
      message: "Validation failed",
      errors: [{ field: "email", message: "Required" }],
    });
  });

  it("should handle nested path correctly", () => {
    const zodError = new ZodError([
      {
        code: "invalid_type",
        expected: "string",
        received: "number",
        path: ["intentions", 0, "group"],
        message: "Expected string",
      },
    ]);

    filter.catch(zodError, mockHost);

    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        errors: [{ field: "intentions.0.group", message: "Expected string" }],
      }),
    );
  });
});
