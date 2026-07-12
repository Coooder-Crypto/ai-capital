import { submitUserCorrection } from "@/lib/repository";
import type { UserCorrectionSubmission } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as UserCorrectionSubmission;
    const result = await submitUserCorrection(body);

    return Response.json(
      {
        data: result.data,
        meta: {
          dataSource: result.dataSource,
          queued: true
        }
      },
      { status: 201 }
    );
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Invalid correction submission"
      },
      { status: 400 }
    );
  }
}
