import { createServiceClient } from '@/lib/supabase/server'

export async function logAudit(
  userId: string,
  action: string,
  resourceType: string,
  resourceId: string | null = null,
  metadata: Record<string, unknown> = {}
) {
  try {
    const supabase = await createServiceClient()
    await supabase.from('audit_logs').insert({
      user_id: userId,
      action,
      resource_type: resourceType,
      resource_id: resourceId,
      metadata,
    })
  } catch {
    // Audit failures should not break main flow
  }
}
