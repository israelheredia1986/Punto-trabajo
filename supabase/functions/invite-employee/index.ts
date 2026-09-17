import { withSupabase } from 'npm:@supabase/server'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

export default {
  fetch: withSupabase({ auth: 'user' }, async (req, ctx) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
    if (req.method !== 'POST') return json({ error: 'Método no permitido.' }, 405)

    try {
      const body = await req.json()
      const companyId = String(body.companyId || '').trim()
      const fullName = String(body.fullName || '').trim()
      const email = String(body.email || '').trim().toLowerCase()
      const jobTitle = String(body.jobTitle || '').trim() || null
      const role = body.role === 'supervisor' ? 'supervisor' : 'employee'
      const teamId = body.teamId ? String(body.teamId).trim() : null

      if (!companyId || !fullName || !email) {
        return json({ error: 'Empresa, nombre y email son obligatorios.' }, 400)
      }

      const callerId = ctx.userClaims?.sub
      if (!callerId) return json({ error: 'Sesión no válida.' }, 401)

      const { data: membership, error: membershipError } = await ctx.supabase
        .from('company_memberships')
        .select('company_id, user_id, role, status')
        .eq('company_id', companyId)
        .eq('user_id', callerId)
        .eq('role', 'admin')
        .eq('status', 'active')
        .maybeSingle()

      if (membershipError) throw membershipError
      if (!membership) return json({ error: 'No tienes permisos para gestionar esta empresa.' }, 403)

      if (teamId) {
        const { data: team, error: teamError } = await ctx.supabase
          .from('teams')
          .select('id,company_id')
          .eq('id', teamId)
          .eq('company_id', companyId)
          .maybeSingle()
        if (teamError) throw teamError
        if (!team) return json({ error: 'El equipo seleccionado no pertenece a esta empresa.' }, 400)
      }

      const { data: invited, error: inviteError } = await ctx.supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        data: {
          full_name: fullName,
          job_title: jobTitle,
          company_id: companyId,
        },
      })

      if (inviteError) {
        return json({ error: inviteError.message }, 400)
      }

      const userId = invited.user?.id
      if (!userId) return json({ error: 'Supabase no devolvió el usuario invitado.' }, 500)

      try {
        const { error: profileError } = await ctx.supabaseAdmin
          .from('profiles')
          .upsert({ id: userId, full_name: fullName }, { onConflict: 'id' })
        if (profileError) throw profileError

        const { error: membershipInsertError } = await ctx.supabaseAdmin
          .from('company_memberships')
          .insert({
            company_id: companyId,
            user_id: userId,
            role,
            status: 'invited',
            job_title: jobTitle,
          })
        if (membershipInsertError) throw membershipInsertError

        if (teamId) {
          const { error: teamMemberError } = await ctx.supabaseAdmin
            .from('team_members')
            .insert({ team_id: teamId, user_id: userId })
          if (teamMemberError) throw teamMemberError
        }
      } catch (error) {
        await ctx.supabaseAdmin.auth.admin.deleteUser(userId)
        throw error
      }

      return json({
        ok: true,
        user: {
          id: userId,
          email,
          fullName,
          role,
          status: 'invited',
          teamId,
        },
      }, 201)
    } catch (error) {
      console.error('invite-employee:', error)
      return json({ error: error instanceof Error ? error.message : 'No se pudo crear la invitación.' }, 500)
    }
  }),
}
