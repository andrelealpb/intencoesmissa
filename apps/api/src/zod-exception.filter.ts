import { ExceptionFilter, Catch, ArgumentsHost, HttpStatus } from "@nestjs/common";
import { Response } from "express";
import { ZodError } from "zod";

@Catch(ZodError)
export class ZodExceptionFilter implements ExceptionFilter {
  catch(exception: ZodError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    response.status(HttpStatus.BAD_REQUEST).json({
      statusCode: HttpStatus.BAD_REQUEST,
      message: "Validation failed",
      errors: exception.errors.map((e) => ({
        field: e.path.join("."),
        message: e.message,
      })),
    });
  }
}
