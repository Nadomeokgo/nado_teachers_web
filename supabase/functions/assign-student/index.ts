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

const igcPricingKeys = [
  "four_lesson_tuition", "nado_fee_percent", "four_lesson_nado_fee",
  "four_lesson_teacher_payout", "teacher_payout_amount", "pricing_version",
] as const;

// Keep this table aligned with js/pricing.js and the IGC database CHECK.
// The discount is once per full 4/8-session package, not once per student or lesson.
function expectedIgcPricing(input: Record<string, unknown>) {
  const rates: Record<string, Record<number, number>> = {
    economy: { 1: 140000, 2: 200000, 3: 270000, 4: 320000 },
    standard: { 1: 180000, 2: 260000, 3: 360000, 4: 440000 },
    premium: { 1: 220000 },
  };
  const duration = Number(input.lesson_duration_minutes);
  const weekly = Number(input.weekly_frequency);
  const sessions = Number(input.settlement_sessions);
  const groupSize = Number(input.group_size) || 1;
  const hourly = rates[String(input.plan)]?.[groupSize];
  if (!hourly || ![60, 120].includes(duration) || ![1, 2].includes(weekly)
    || !Number.isInteger(sessions) || sessions < 1 || sessions > weekly * 4) return null;
  const tuition = hourly * (duration / 60) - 10000 / weekly;
  const fee = Math.round(tuition * 0.35);
  const payout = tuition - fee;
  return {
    four_lesson_tuition: tuition,
    nado_fee_percent: 35,
    four_lesson_nado_fee: fee,
    four_lesson_teacher_payout: payout,
    teacher_payout_amount: Math.round(payout * sessions / 4),
  };
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
    const assignmentType = ["regular", "trial", "paid_trial"].includes(input.assignment_type)
      ? input.assignment_type
      : "regular";
    const name = String(input.student_name || "").trim();
    const email = String(input.student_email || "").trim().toLowerCase();
    const teacherId = String(input.teacher_id || "");
    const assignmentId = input.assignment_id ? String(input.assignment_id) : null;
    const hasPaymentStatus = Object.prototype.hasOwnProperty.call(input, "payment_status");
    if (hasPaymentStatus && input.payment_status !== null && !["paid", "unpaid"].includes(input.payment_status)) {
      return json({ error: "입금 상태는 미입금 또는 입금 완료로 선택해주세요." }, 400);
    }
    // Older clients omit this field. Preserve an existing assignment's status,
    // default new paid lessons to unpaid, and never mark free trials as owing.
    const paymentFields = assignmentType === "trial"
      ? { payment_status: null }
      : hasPaymentStatus
        ? { payment_status: input.payment_status }
        : assignmentId ? {} : { payment_status: "unpaid" };
    if (!name || !teacherId || !input.first_lesson_date || !input.settlement_date) {
      return json({ error: "필수 배정 정보를 입력해주세요." }, 400);
    }
    if (assignmentType === "regular" && !email.includes("@")) {
      return json({ error: "학생 이메일 형식을 확인해주세요." }, 400);
    }

    const hasIgcDiscount = Object.prototype.hasOwnProperty.call(input, "igc_discount");
    if (hasIgcDiscount && typeof input.igc_discount !== "boolean") {
      return json({ error: "IGC 할인 적용 여부를 확인해주세요." }, 400);
    }
    if (input.igc_discount === true && assignmentType !== "regular") {
      return json({ error: "IGC 할인은 정규 수업에만 적용할 수 있습니다." }, 400);
    }
    const igcFields: Record<string, unknown> = { igc_discount: input.igc_discount === true };
    // A cached older admin page does not know about the discount. Its usual
    // recalculation must never overwrite an existing discounted snapshot.
    if (assignmentId && !hasIgcDiscount) {
      const { data: existingAssignment, error: discountLookupError } = await admin
        .from("student_assignments")
        .select("igc_discount, assignment_type, plan, lesson_duration_minutes, weekly_frequency, settlement_sessions, group_size, four_lesson_tuition, nado_fee_percent, four_lesson_nado_fee, four_lesson_teacher_payout, teacher_payout_amount, pricing_version")
        .eq("id", assignmentId)
        .maybeSingle();
      if (discountLookupError) throw discountLookupError;
      if (!existingAssignment) return json({ error: "수정할 학생 배정을 찾을 수 없습니다." }, 404);
      if (existingAssignment.igc_discount) {
        const sameDimensions = assignmentType === existingAssignment.assignment_type
          && input.plan === existingAssignment.plan
          && Number(input.lesson_duration_minutes) === existingAssignment.lesson_duration_minutes
          && Number(input.weekly_frequency) === existingAssignment.weekly_frequency
          && Number(input.settlement_sessions) === existingAssignment.settlement_sessions
          && (Number(input.group_size) || 1) === existingAssignment.group_size;
        if (!sameDimensions) {
          return json({ error: "IGC 할인이 적용된 배정입니다. 페이지를 새로고침한 후 수업 조건을 수정해주세요." }, 400);
        }
        igcFields.igc_discount = true;
        for (const key of igcPricingKeys) igcFields[key] = existingAssignment[key];
      }
    }
    if (hasIgcDiscount && input.igc_discount) {
      const expected = expectedIgcPricing(input);
      if (!expected || !Object.entries(expected).every(([key, value]) => Number(input[key]) === value)
        || input.pricing_version !== "NADO-2026-11-IGC-10000") {
        return json({ error: "IGC 할인 금액이 올바르지 않습니다. 정규 패키지 총액에서 10,000원을 할인한 뒤 수수료 35%로 다시 계산해주세요." }, 400);
      }
      Object.assign(igcFields, expected);
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
      ...paymentFields,
      plan: input.plan || null,
      lesson_duration_minutes: input.lesson_duration_minutes || null,
      weekly_frequency: assignmentType === "paid_trial" ? 1 : (input.weekly_frequency || null),
      settlement_sessions: assignmentType === "paid_trial" ? 1 : (input.settlement_sessions || null),
      four_lesson_tuition: input.four_lesson_tuition ?? null,
      nado_fee_percent: input.nado_fee_percent ?? null,
      four_lesson_nado_fee: input.four_lesson_nado_fee ?? null,
      four_lesson_teacher_payout: input.four_lesson_teacher_payout ?? null,
      teacher_payout_amount: input.teacher_payout_amount ?? null,
      pricing_version: input.pricing_version || null,
      ...igcFields,
      first_lesson_date: input.first_lesson_date,
      settlement_date: input.settlement_date,
      status: "active",
      ended_at: null,
    };

    const query = assignmentId
      ? admin.from("student_assignments").update(payload).eq("id", assignmentId)
      : admin.from("student_assignments").insert(payload);
    const { data: assignment, error: assignmentError } = await query.select("id,student_id,teacher_id,status,payment_status,igc_discount").single();
    if (assignmentError) throw assignmentError;

    return json({ ok: true, assignment, invitation_sent: invitationSent });
  } catch (error) {
    console.error(error);
    return json({ error: error instanceof Error ? error.message : "학생 배정 중 오류가 발생했습니다." }, 400);
  }
});
