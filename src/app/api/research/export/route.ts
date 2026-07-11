import { exportDatasetAsJson, parseDataset, parseFormat, readExportCsv } from "@/lib/research-artifacts";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const dataset = parseDataset(searchParams.get("dataset"));
  const format = parseFormat(searchParams.get("format"));

  if (format === "json") {
    return Response.json({
      data: await exportDatasetAsJson(dataset),
      meta: {
        dataset,
        format
      }
    });
  }

  let csv: string;
  try {
    csv = await readExportCsv(dataset);
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "CSV export is not available for this dataset",
        meta: {
          dataset,
          format
        }
      },
      { status: 400 }
    );
  }
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="ai-capital-${dataset}.csv"`
    }
  });
}
