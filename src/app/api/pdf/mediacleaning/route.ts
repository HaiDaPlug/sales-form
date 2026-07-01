import { NextRequest, NextResponse } from "next/server";
import { mediacleaningStepSchema } from "@/lib/crm/schemas";
import { generateMediacleaningPdf } from "@/lib/pdf/service";

export async function POST(request: NextRequest) {
  try {
    const parsed = mediacleaningStepSchema.parse(await request.json());
    const pdf = await generateMediacleaningPdf(parsed);

    return NextResponse.json({
      ok: true,
      fileName: pdf.fileName,
      message: "Draft Mediacleaning PDF generated. Upload/notes should run after approved templates are connected."
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
