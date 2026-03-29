import OpenAI from 'openai';
import logger from '../middleware/logger';
import { TaskExtractionError } from '../middleware/errorHandler';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ExtractedTask {
  title: string;
  owner: string;
  owner_email: string;
  deadline: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  reasoning: string;
}

// ─── System Prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an expert meeting analyst. Extract all action items and tasks from the meeting transcript. Return ONLY a valid JSON array, no markdown, no explanation. Each task object must have exactly these fields:
- title: string (clear, actionable task description, max 200 chars)
- owner: string (full name of the person responsible)
- owner_email: string (email if mentioned, else empty string)
- deadline: string (ISO 8601 format, infer from context, if unclear use 7 days from today)
- priority: 'low' | 'medium' | 'high' | 'critical'
- reasoning: string (one sentence explaining why this is a task)`;

// ─── OpenAI Service ───────────────────────────────────────────────────────────

class OpenAIService {
  private client: OpenAI;
  private readonly MAX_RETRIES = 3;
  private readonly BACKOFF_DELAYS = [500, 1000, 2000]; // ms

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      logger.warn('OpenAI API key not set — task extraction will fail');
    }
    this.client = new OpenAI({ apiKey: apiKey ?? 'missing-key' });
  }

  /**
   * Extract action items from a meeting transcript using GPT.
   * Implements exponential backoff on rate limit / network errors.
   */
  async extractTasksFromTranscript(transcript: string): Promise<ExtractedTask[]> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.MAX_RETRIES; attempt++) {
      try {
        if (attempt > 0) {
          const delay = this.BACKOFF_DELAYS[attempt - 1];
          logger.warn(`OpenAIService: Retry attempt ${attempt + 1}/${this.MAX_RETRIES} after ${delay}ms`);
          await this.sleep(delay);
        }

        logger.info('OpenAIService: Sending transcript to GPT for task extraction', {
          transcript_length: transcript.length,
          attempt: attempt + 1,
        });

        const response = await this.client.chat.completions.create({
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: `Meeting Transcript:\n\n${transcript}` },
          ],
          temperature: 0.2,
          max_tokens: 4000,
          response_format: { type: 'json_object' },
        });

        const rawContent = response.choices[0]?.message?.content;
        if (!rawContent) {
          throw new TaskExtractionError('OpenAI returned empty response');
        }

        return this.parseAndValidateResponse(rawContent);
      } catch (err) {
        const error = err as Error;
        lastError = error;

        // Don't retry TaskExtractionError (parse failure)
        if (err instanceof TaskExtractionError) {
          throw err;
        }

        // Check if it's a rate limit or network error (retryable)
        const isRetryable = this.isRetryableError(error);
        if (!isRetryable || attempt === this.MAX_RETRIES - 1) {
          logger.error('OpenAIService: Non-retryable error or max retries exceeded', {
            error: error.message,
            attempt: attempt + 1,
          });
          break;
        }

        logger.warn('OpenAIService: Retryable error encountered', {
          error: error.message,
          attempt: attempt + 1,
        });
      }
    }

    throw new TaskExtractionError(
      `Task extraction failed after ${this.MAX_RETRIES} attempts: ${lastError?.message}`,
    );
  }

  /**
   * Parse and validate the GPT JSON response.
   */
  private parseAndValidateResponse(rawContent: string): ExtractedTask[] {
    let parsed: unknown;

    try {
      parsed = JSON.parse(rawContent);
    } catch {
      // Try to extract JSON array from content
      const match = rawContent.match(/\[[\s\S]*\]/);
      if (match) {
        try {
          parsed = JSON.parse(match[0]);
        } catch {
          throw new TaskExtractionError(
            'Failed to parse OpenAI response as JSON',
            rawContent,
          );
        }
      } else {
        throw new TaskExtractionError(
          'Failed to parse OpenAI response as JSON',
          rawContent,
        );
      }
    }

    // Handle both array and object with tasks array
    let tasks: unknown[];
    if (Array.isArray(parsed)) {
      tasks = parsed;
    } else if (typeof parsed === 'object' && parsed !== null) {
      const obj = parsed as Record<string, unknown>;
      const firstArrayValue = Object.values(obj).find(Array.isArray);
      if (firstArrayValue) {
        tasks = firstArrayValue as unknown[];
      } else {
        throw new TaskExtractionError('Response is not a JSON array', rawContent);
      }
    } else {
      throw new TaskExtractionError('Unexpected response format', rawContent);
    }

    // Validate each task object
    const validPriorities = ['low', 'medium', 'high', 'critical'];
    return tasks.map((task, index) => {
      if (typeof task !== 'object' || task === null) {
        throw new TaskExtractionError(`Task at index ${index} is not an object`, rawContent);
      }
      const t = task as Record<string, unknown>;
      if (!t.title || !t.owner || !t.deadline || !t.priority || !t.reasoning) {
        throw new TaskExtractionError(
          `Task at index ${index} is missing required fields`,
          rawContent,
        );
      }
      if (!validPriorities.includes(t.priority as string)) {
        throw new TaskExtractionError(
          `Task at index ${index} has invalid priority: ${t.priority}`,
          rawContent,
        );
      }
      return {
        title: String(t.title).substring(0, 200),
        owner: String(t.owner),
        owner_email: String(t.owner_email ?? ''),
        deadline: String(t.deadline),
        priority: t.priority as ExtractedTask['priority'],
        reasoning: String(t.reasoning),
      };
    });
  }

  private isRetryableError(err: Error): boolean {
    const message = err.message.toLowerCase();
    return (
      message.includes('rate limit') ||
      message.includes('429') ||
      message.includes('network') ||
      message.includes('timeout') ||
      message.includes('503') ||
      message.includes('502') ||
      message.includes('econnreset') ||
      message.includes('econnrefused')
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export const openaiService = new OpenAIService();
export default OpenAIService;
