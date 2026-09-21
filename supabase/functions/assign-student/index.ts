import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
});

const readDefaultKey = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) return "";
  try {
    const keys = JSON.parse(value) as Record<string, string>;
    return keys.default || Object.values(keys)[0] || "";
  } catch {
    return value;
  }
};

async function findAuthUserByEmail(admin: ReturnType<typeof createClient>, email: string) {
  const perPage = 1000;
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const user = data.users.find((item) => item.email?.toLowerCase() === email);
    if (user) return user;
    if (data.users.length < perPage) return null;
  }
  throw new Error("기존 학생 계정 확인 범위를 초과했습니다. 운영팀에 문의해주세요.");
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = readDefaultKey("SUPABASE_PUBLISHABLE_KEYS") || Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = readDefaultKey("SUPABASE_SECRET_KEYS") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const mainSiteUrl = (Deno.env.get("MAIN_SITE_URL") || "https://hellonado.com").replace(/\/$/, "");
    const authorization = request.headers.get("Authorization") || "";
    if (!supabaseUrl || !anonKey || !serviceRoleKey) return json({ error: "서버 환경 설정이 완료되지 않았습니다." }, 500);

    const caller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: userData, error: userError } = await caller.auth.getUser();
    if (userError || !userData.user) return json({ error: "로그인이 필요합니다." }, 401);

    const { data: callerProfile, error: callerProfileError } = await caller
      .from("profiles")
      .select("role, account_status")
      .eq("id", userData.user.id)
      .maybeSingle();
    if (callerProfileError) return json({ error: `관리자 권한 확인 실패: ${callerProfileError.message}` }, 500);
    if (callerProfile?.role !== "admin" || callerProfile?.account_status !== "active") {
      return json({ error: "관리자만 학생을 배정할 수 있습니다." }, 403);
    }

    const input = await request.json();
    const assignmentType = input.assignment_type === "trial" ? "trial" : "regular";
    const name = String(input.student_name || "").trim();
    const email = String(input.student_email || "").trim().toLowerCase();
    const teacherId = String(input.teacher_id || "");
    const assignmentId = input.assignment_id ? String(input.assignment_id) : null;
    if (!name || !teacherId || !input.first_lesson_date || !input.settlement_date) {
      return json({ error: "필수 배정 정보를 입력해주세요." }, 400);
    }
    if (assignmentType === "regular" && !email.includes("@")) {
      return json({ error: "학생 이메일 형식을 확인해주세요." }, 400);
    }

    let studentRecord: { id: string; auth_user_id: string | null; invitation_status: string } | null = null;
    let invitationSent = false;

    if (assignmentType === "regular") {
      const { data: existingStudent, error: lookupError } = await admin
        .from("student_records")
        .select("id,auth_user_id,invitation_status")
        .ilike("email", email)
        .maybeSingle();
      if (lookupError) throw lookupError;

      if (existingStudent) {
        const { data, error } = await admin.from("student_records").update({
          full_name: name,
          plan: input.plan || null,
          status: "active",
          access_start: new Date().toISOString().slice(0, 10),
          access_end: null,
        }).eq("id", existingStudent.id).select("id,auth_user_id,invitation_status").single();
        if (error) throw error;
        studentRecord = data;
      } else {
        const { data, error } = await admin.from("student_records").insert({
          email,
          full_name: name,
          plan: input.plan || null,
          status: "active",
          invitation_status: "not_sent",
          access_start: new Date().toISOString().slice(0, 10),
        }).select("id,auth_user_id,invitation_status").single();
        if (error) throw error;
        studentRecord = data;
      }

      if (!studentRecord.auth_user_id) {
        const [{ data: emailProfile, error: profileError }, existingAuthUser] = await Promise.all([
          admin.from("profiles").select("id,role").ilike("email", email).maybeSingle(),
          findAuthUserByEmail(admin, email),
        ]);
        if (profileError) throw profileError;
        if (emailProfile && existingAuthUser && emailProfile.id !== existingAuthUser.id) {
          return json({ error: "이메일 계정 연결 정보가 서로 달라 운영팀 확인이 필요합니다." }, 409);
        }

        const existingUserId = emailProfile?.id || existingAuthUser?.id || null;
        let existingRole = emailProfile?.role || null;
        if (existingUserId && !existingRole) {
          const { data: idProfile, error: idProfileError } = await admin
            .from("profiles")
            .select("role")
            .eq("id", existingUserId)
            .maybeSingle();
          if (idProfileError) throw idProfileError;
          existingRole = idProfile?.role || null;
        }
        if (existingRole && existingRole !== "student") {
          return json({ error: "이 이메일은 이미 선생님 또는 관리자 계정으로 사용 중입니다." }, 409);
        }

        if (existingUserId) {
          const { error: upsertProfileError } = await admin.from("profiles").upsert({
            id: existingUserId,
            email,
            full_name: name,
            role: "student",
            account_status: "active",
          }, { onConflict: "id" });
          if (upsertProfileError) throw upsertProfileError;
          const { error: linkError } = await admin.from("student_records").update({
            auth_user_id: existingUserId,
            invitation_status: "active",
            activated_at: new Date().toISOString(),
          }).eq("id", studentRecord.id);
          if (linkError) throw linkError;
          studentRecord.auth_user_id = existingUserId;
        } else {
          const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
            redirectTo: `${mainSiteUrl}/member-welcome.html`,
            data: { full_name: name, role: "student", student_record_id: studentRecord.id },
          });
          if (inviteError) {
            await admin.from("student_records").update({ invitation_status: "failed" }).eq("id", studentRecord.id);
            throw inviteError;
          }
          invitationSent = true;
          const { error: linkError } = await admin.from("student_records").update({
            auth_user_id: invited.user.id,
            invitation_status: "sent",
            invited_at: new Date().toISOString(),
          }).eq("id", studentRecord.id);
          if (linkError) throw linkError;
          const { error: profileUpsertError } = await admin.from("profiles").upsert({
            id: invited.user.id,
            email,
            full_name: name,
            role: "student",
            account_status: "active",
          }, { onConflict: "id" });
          if (profileUpsertError) throw profileUpsertError;
          studentRecord.auth_user_id = invited.user.id;
        }
      }

      if (!assignmentId) {
        const { error: previousEndError } = await admin.from("student_assignments").update({
          status: "ended",
          ended_at: new Date().toISOString(),
        }).eq("student_id", studentRecord.id).eq("status", "active").eq("assignment_type", "regular");
        if (previousEndError) throw previousEndError;
      }
    }

    const payload = {
      teacher_id: teacherId,
      student_id: studentRecord?.id || null,
      student_name: name,
      student_email: email || null,
      group_size: Number(input.group_size) || 1,
      group_members: Array.isArray(input.group_members) ? input.group_members : [{ name, email: email || null }],
      assignment_type: assignmentType,
      plan: input.plan || null,
      lesson_duration_minutes: input.lesson_duration_minutes || null,
      weekly_frequency: input.weekly_frequency || null,
      settlement_sessions: input.settlement_sessions || null,
      four_lesson_tuition: input.four_lesson_tuition ?? null,
      nado_fee_percent: input.nado_fee_percent ?? null,
      four_lesson_nado_fee: input.four_lesson_nado_fee ?? null,
      four_lesson_teacher_payout: input.four_lesson_teacher_payout ?? null,
      teacher_payout_amount: input.teacher_payout_amount ?? null,
      pricing_version: input.pricing_version || null,
      first_lesson_date: input.first_lesson_date,
      settlement_date: input.settlement_date,
      status: "active",
      ended_at: null,
    };

    const query = assignmentId
      ? admin.from("student_assignments").update(payload).eq("id", assignmentId)
      : admin.from("student_assignments").insert(payload);
    const { data: assignment, error: assignmentError } = await query.select("id,student_id,teacher_id,status").single();
    if (assignmentError) throw assignmentError;

    return json({ ok: true, assignment, invitation_sent: invitationSent });
  } catch (error) {
    console.error(error);
    return json({ error: error instanceof Error ? error.message : "학생 배정 중 오류가 발생했습니다." }, 400);
  }
});
