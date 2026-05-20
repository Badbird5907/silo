import { HTTP_STATUS } from "../../utils/constants";
import { TusError } from "../../utils/errors";

export interface ParsedContentRange {
  start: number;
  end: number;
  total: number;
  length: number;
}

const CONTENT_RANGE_PATTERN = /^bytes\s+(\d+)-(\d+)\/(\d+)$/i;

export function parseContentRangeHeader(
  value: string | null | undefined,
): ParsedContentRange {
  if (!value) {
    throw new TusError(
      "INVALID_REQUEST",
      HTTP_STATUS.BAD_REQUEST,
      "Content-Range header is required",
    );
  }

  const match = CONTENT_RANGE_PATTERN.exec(value.trim());
  if (!match) {
    throw new TusError(
      "INVALID_REQUEST",
      HTTP_STATUS.BAD_REQUEST,
      'Content-Range must use "bytes <start>-<end>/<total>"',
    );
  }

  const [, startRaw, endRaw, totalRaw] = match;
  if (!startRaw || !endRaw || !totalRaw) {
    throw new TusError(
      "INVALID_REQUEST",
      HTTP_STATUS.BAD_REQUEST,
      'Content-Range must use "bytes <start>-<end>/<total>"',
    );
  }

  const start = Number.parseInt(startRaw, 10);
  const end = Number.parseInt(endRaw, 10);
  const total = Number.parseInt(totalRaw, 10);

  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    !Number.isSafeInteger(total) ||
    start < 0 ||
    end < start ||
    total <= 0 ||
    end >= total
  ) {
    throw new TusError(
      "INVALID_REQUEST",
      HTTP_STATUS.BAD_REQUEST,
      "Content-Range has invalid byte positions",
      { start, end, total },
    );
  }

  return {
    start,
    end,
    total,
    length: end - start + 1,
  };
}

export function buildContentRangeHeader(input: {
  start: number;
  end: number;
  total: number;
}): string {
  return `bytes ${input.start}-${input.end}/${input.total}`;
}
