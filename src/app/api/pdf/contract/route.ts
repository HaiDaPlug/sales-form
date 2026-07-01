import { NextRequest, NextResponse } from "next/server";
import { contractStepSchema } from "@/lib/crm/schemas";
import { generateContractPdf } from "@/lib/pdf/service";

export async function POST(request: NextRequest) {
  try {
    const parsed = contractStepSchema.parse(await request.json());
    const pdf = await generateContractPdf(parsed);

    return NextResponse.json({
      ok: true,
      fileName: pdf.fileName,
      message: "Draft contract PDF generated. Upload/notes should run after approved templates are connected."
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
