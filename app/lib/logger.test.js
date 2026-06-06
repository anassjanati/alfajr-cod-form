import { describe, it, expect, beforeEach } from "vitest";
import { createLogger } from "./logger";

describe("Logger", () => {
  let logOutput;

  beforeEach(() => {
    logOutput = [];
    global.console = {
      log: (msg) => logOutput.push({ level: "log", msg }),
      error: (msg) => logOutput.push({ level: "error", msg }),
      warn: (msg) => logOutput.push({ level: "warn", msg })
    };
  });

  it("should create logger with context", () => {
    const logger = createLogger({ service: "test" });
    expect(logger).toBeDefined();
    expect(logger.info).toBeDefined();
    expect(logger.error).toBeDefined();
    expect(logger.warn).toBeDefined();
  });

  it("should log info message with context", () => {
    const logger = createLogger({ service: "test" });
    logger.info("Test message", { data: "test" });

    expect(logOutput.length).toBe(1);
    expect(logOutput[0].level).toBe("log");

    const parsed = JSON.parse(logOutput[0].msg);
    expect(parsed.level).toBe("info");
    expect(parsed.message).toBe("Test message");
    expect(parsed.context.service).toBe("test");
    expect(parsed.data).toBe("test");
  });

  it("should log error with stack trace", () => {
    const logger = createLogger({ service: "test" });
    const error = new Error("Test error");
    logger.error("Error occurred", error, { request: "123" });

    expect(logOutput.length).toBe(1);
    expect(logOutput[0].level).toBe("error");

    const parsed = JSON.parse(logOutput[0].msg);
    expect(parsed.level).toBe("error");
    expect(parsed.message).toBe("Error occurred");
    expect(parsed.error).toBe("Test error");
    expect(parsed.stack).toBeDefined();
    expect(parsed.request).toBe("123");
  });

  it("should log warning message", () => {
    const logger = createLogger({ service: "test" });
    logger.warn("Warning", { code: 400 });

    expect(logOutput.length).toBe(1);
    expect(logOutput[0].level).toBe("warn");

    const parsed = JSON.parse(logOutput[0].msg);
    expect(parsed.level).toBe("warn");
    expect(parsed.message).toBe("Warning");
    expect(parsed.code).toBe(400);
  });

  it("should include timestamp in all logs", () => {
    const logger = createLogger({});
    logger.info("Test");

    const parsed = JSON.parse(logOutput[0].msg);
    expect(parsed.timestamp).toBeDefined();
    expect(new Date(parsed.timestamp)).toBeInstanceOf(Date);
  });

  it("should work with empty context", () => {
    const logger = createLogger();
    logger.info("Test message");

    expect(logOutput.length).toBe(1);
    const parsed = JSON.parse(logOutput[0].msg);
    expect(parsed.context).toBeDefined();
  });
});
