# 나도 Teachers

나도 선생님 전용 운영 사이트입니다. 기존 나도 학생용 사이트의 파란색·네이비 브랜드 스타일을 유지하면서, 정보 전달보다 실제 업무 처리를 우선한 대시보드 형태로 구성했습니다.

## 포함된 기능

- 선생님 이메일/비밀번호 로그인
- 주간 가능 스케줄을 드래그로 연속 선택, 수정, 저장
- 선생님별 스케줄 데이터 분리
- 관리자 전체 스케줄 조회 및 CSV 다운로드
- 공지사항
- 첫 수업 체크리스트
- 내부 커리큘럼 작성·초안·게시 및 선생님 전용 열람
- 이전 기간의 기존 자료 링크와 회원 전용 첨부 파일
- YouTube 교육 영상 임베드
- 선생님 프로필 관리
- 모바일 반응형 화면

## 선생님 프로필 영문 입력

최초 등록과 프로필 수정 시 이름·학교·전공·소개·경험 및 활동을 영문으로 작성합니다. 비라틴 문자가 포함되면 해당 입력란에 안내하고 저장을 막습니다. 숫자·문장부호·악센트가 있는 영문 이름은 허용하며, 연락처·은행명·계좌·관리자 전용 닉네임은 이 규칙에서 제외합니다.

기존 프로필은 자동으로 변경하지 않습니다. 선생님이 공개 프로필을 다시 저장할 때 영문 입력을 확인하며, 소개의 500자 제한도 유지합니다. 서버 검증은 `sql/teacher_profile_english_only_update.sql`을 적용한 뒤 사이트 파일을 배포합니다.

## 전체 구조

```text
nado_teachers_site/
├── index.html              # 선생님 로그인 및 대시보드
├── admin.html              # 관리자 스케줄 조회
├── css/
│   └── style.css
├── js/
│   ├── config.js           # Supabase 주소와 키 입력
│   ├── config.example.js
│   ├── app.js
│   └── admin.js
└── sql/
    └── schema.sql          # 테이블, RLS 보안 정책, 예시 데이터
```

## 왜 GitHub Pages만으로는 부족한가

GitHub Pages는 HTML, CSS, JavaScript를 배포하는 정적 호스팅입니다. 선생님별 로그인과 스케줄 영구 저장에는 별도의 데이터베이스/인증 서비스가 필요합니다. 이 프로젝트는 Supabase를 백엔드로 사용합니다.

## 1. GitHub 저장소 만들기

1. GitHub에서 `nado_teachers_web`이라는 새 저장소를 만듭니다.
2. 이 폴더 안의 파일을 모두 저장소 최상단에 업로드합니다.
3. 아직 Pages는 켜지 않아도 됩니다.

## 2. Supabase 프로젝트 만들기

1. Supabase에서 새 프로젝트를 생성합니다.
2. 좌측 `SQL Editor`에서 `sql/schema.sql` 전체를 붙여넣고 실행합니다.
3. 좌측 `Authentication → Providers → Email`에서 Email 로그인을 활성화합니다.
4. 운영 초기에는 공개 회원가입을 사용하지 않고, `Authentication → Users → Add user`로 선생님 계정을 직접 생성하는 방식을 권장합니다.

## 3. 사이트와 Supabase 연결하기

Supabase Dashboard의 `Project Settings → API`에서 다음 값을 찾습니다.

- Project URL
- anon key 또는 publishable key

`js/config.js`를 열고 아래처럼 바꿉니다.

```js
window.NADO_CONFIG = {
  SUPABASE_URL: "https://실제프로젝트ID.supabase.co",
  SUPABASE_ANON_KEY: "실제_ANON_또는_PUBLISHABLE_KEY",
  SUPPORT_URL: "실제_카카오채널_URL",
  SITE_NAME: "나도 Teachers"
};
```

### 절대 넣으면 안 되는 키

`service_role` 키는 관리자 권한을 모두 가지고 있으므로 웹사이트 코드에 절대 넣지 않습니다. 브라우저에는 anon/publishable 키만 넣고, 데이터 접근 제한은 `schema.sql`의 RLS 정책으로 처리합니다.

## 4. 관리자 계정 지정하기

1. Supabase `Authentication → Users`에서 본인 계정을 만듭니다.
2. SQL Editor에서 본인 이메일을 넣어 실행합니다.

```sql
update public.profiles
set role = 'admin'
where email = '본인이메일@example.com';
```

관리자로 로그인하면 왼쪽 메뉴에 `관리자 페이지`가 나타납니다.

## 5. 선생님 계정 만들기

Supabase `Authentication → Users → Add user`에서 각 선생님의 이메일과 임시 비밀번호를 만듭니다. 계정이 생성되면 `profiles` 행도 자동 생성됩니다.

선생님에게는 다음 3가지만 전달하면 됩니다.

- 사이트 주소
- 등록 이메일
- 임시 비밀번호

## 6. 자료와 영상을 추가하는 방법

### 공지사항

Supabase `Table Editor → announcements`에서 행을 추가합니다.

- title: 제목
- body: 내용
- is_active: 노출 여부
- published_at: 게시일

### 내부 커리큘럼

관리자 페이지 상단의 **커리큘럼 관리**를 누릅니다. **새 수업 만들기**에서 제목·플랜·수준·주제·시간을 입력하고, 기본 5단계(Warm-up → 목표/표현 → 연습 → 대화 → 피드백)의 본문을 작성합니다. 단계는 추가·삭제·순서 변경할 수 있고, 각 단계에 선생님 진행 메모를 붙일 수 있습니다. 입력한 줄바꿈이 그대로 표시되며 한국어와 영어 모두 사용할 수 있습니다. 본문은 자동 번역되지 않습니다.

- **초안 저장**: 관리자에게만 표시합니다.
- **미리보기**: 아직 저장하지 않은 입력을 선생님 화면 형식으로 확인합니다.
- **선생님에게 공개**: 활성 선생님이 커리큘럼 탭에서 검색하고 읽을 수 있습니다.
- **수정 저장**: 게시 중인 수업이면 선생님 화면에도 바로 반영됩니다.
- **비공개 초안으로 전환**: 자료를 보존하면서 선생님 목록에서 숨깁니다.
- **초안으로 복제**: 비슷한 수업을 빠르게 작성할 때 사용합니다.

동시에 다른 관리자가 저장한 경우에는 덮어쓰지 않고 충돌을 안내합니다. 작성 중인 초안은 자동 저장되지 않습니다.

기존 Google Drive 자료는 자동으로 가져오지 않습니다. 관리자에서 내용을 내부 수업으로 옮겨 게시한 후, **기존 외부 링크 표시**를 끄면 선생님 화면과 자료 API에서 기존 외부 링크가 숨겨집니다. 이 설정은 기본적으로 켜져 있으며, 회원 전용 업로드 파일과 학생 사이트의 자료 접근에는 영향을 주지 않습니다. Drive 자체의 기존 공유 권한은 별도로 해제해야 합니다.

내부 본문은 GitHub Pages의 공개 파일에 포함하지 않고 Supabase에 저장합니다. 데이터베이스 RLS로 익명·학생·비활성 선생님의 접근을 막고, 활성 선생님은 게시된 수업만 읽을 수 있습니다. 열람자는 화면을 복사하거나 캡처할 수 있으므로 내부화가 복제 자체를 완전히 막지는 않습니다. 본문 열람 화면에는 사용자의 이름과 내부 수업용 안내가 표시됩니다.

기존 배포 환경에는 `sql/internal_curriculum_update.sql`을 적용합니다. 이 업데이트는 현재 운영 중인 계정 상태/회원 자료 권한 설정(`account_status`, `is_active`, `can_read_member_resources()`)을 전제로 하며, 사전 검사를 통과해야 적용됩니다. 기존 `schema.sql`만으로 새 환경을 구축하는 경우에는 별도 회원·학생 계정 설정도 먼저 설치해야 합니다. 이번 변경은 기존 자료를 삭제하거나 자동 게시하지 않습니다.

### 교육 영상

영상은 YouTube에 `일부 공개(Unlisted)`로 올린 뒤 URL을 `training_videos.video_url`에 넣습니다.

- title: 영상 제목
- description: 설명
- video_url: 일반 YouTube 주소
- sort_order: 표시 순서
- is_active: 노출 여부

일부 공개 영상은 검색 결과에는 일반적으로 나오지 않지만, 링크를 가진 사람이 다시 공유할 수 있습니다. 영상 자체의 강한 접근 제한이 필요하면 추후 Vimeo/Cloudflare Stream 같은 유료 영상 서비스를 검토하세요.

## 7. GitHub Pages 배포

1. GitHub 저장소 `Settings → Pages`로 이동합니다.
2. `Build and deployment`에서 `Deploy from a branch`를 선택합니다.
3. Branch는 `main`, 폴더는 `/(root)`를 선택하고 Save합니다.
4. 잠시 후 다음 형태의 주소가 생성됩니다.

```text
https://nado3.github.io/nado_teachers_web/
```

## 8. Supabase 로그인 URL 설정

Supabase `Authentication → URL Configuration`에서 다음을 설정합니다.

- Site URL: 실제 GitHub Pages 주소
- Redirect URLs: 실제 GitHub Pages 주소와 `/**`

예시:

```text
https://nado3.github.io/nado_teachers_web/
https://nado3.github.io/nado_teachers_web/**
```

이 설정은 비밀번호 재설정 링크가 정상적으로 돌아오게 하기 위해 필요합니다.

## 운영 권장 순서

1. 먼저 본인 관리자 계정으로 로그인 테스트
2. 테스트 선생님 계정 1개 생성
3. 테스트 선생님으로 시간대 2~3개 제출
4. 관리자 페이지에서 스케줄 확인 및 CSV 다운로드
5. 실제 PDF 링크와 교육 영상 URL 등록
6. 모바일에서 전체 메뉴와 영상 재생 확인
7. 선생님들에게 계정 배포

## 2026-09-19 운영 업데이트 적용

이 버전은 지역별 스케줄, 관리자 When-to-meet 표, 선택형 학생 이메일, 1:2~1:4 배정 및 학생 기록 영구 삭제를 포함합니다.

이전 버전의 같은 SQL을 이미 실행했더라도, 이메일 없는 학생 배정용 관리자 저장 정책이 보강되었으므로 아래 파일의 최신 내용을 다시 실행해주세요. `drop policy if exists`와 `add column if not exists`를 사용해 재실행할 수 있습니다.

기존 Supabase 프로젝트를 사용 중이라면 사이트 파일을 배포하기 전에 다음 파일을 SQL Editor에서 한 번 실행하세요.

```text
sql/teacher_operations_20260919_update.sql
```

이 SQL은 기존 스케줄을 삭제하지 않고 `IGC`, `트리플스트리트`, `송도 내 협의` 값을 새 지역 체계로 변환합니다.

## 2026-09-21 관리자 학생 배정 오류 수정 적용

이번 수정은 선생님 이름 검색, 정산일 경과 학생의 기록 이동, 기록 영구 삭제, 기존 학생 재활성화 및 이메일 계정 중복 처리를 포함합니다. 정산 예정일이 지나면 Supabase Cron이 5분마다 확인하여 관리자 접속 여부와 관계없이 자동으로 학생 기록으로 이동합니다. 아래 순서대로 적용하세요.

1. Supabase `SQL Editor`에서 다음 파일 전체를 실행합니다.

```text
sql/admin_assignment_reliability_20260921_update.sql
```

2. Supabase `Edge Functions → assign-student`의 코드를 다음 파일 내용으로 교체하고 배포합니다.

```text
supabase/functions/assign-student/index.ts
```

Supabase CLI를 사용하는 경우 프로젝트 폴더에서 아래 명령으로 배포할 수 있습니다.

```bash
supabase functions deploy assign-student --project-ref ouanvcvzrjbzbpefslgd
```

3. 그다음 이 프로젝트의 최상위 파일과 폴더를 GitHub에 업로드합니다. `sql`과 `supabase` 폴더도 수정 이력 보관을 위해 함께 올리는 것을 권장합니다.

학생 기록의 `영구 삭제`는 선택한 학생 배정 행만 삭제합니다. 연결되어 있던 음성 제출과 학습 데이터는 보존되고, 삭제된 배정과의 연결만 해제됩니다.

## 수정할 가능성이 높은 부분

- 첫 수업 가이드 문구: `index.html`의 `page-guide`
- 문의 링크: `js/config.js`의 `SUPPORT_URL`
- 색상: `css/style.css` 상단의 `:root`
- 장소 선택지: `index.html`의 `slotLocation`
- 사이트 이름: `index.html`의 title과 사이드바 로고

## 보안 체크

- GitHub에 service_role 키 업로드 금지
- RLS 정책을 끄지 않기
- 관리자 권한은 SQL로 직접 지정
- 선생님 계정은 운영팀이 직접 생성
- 주민등록번호, 신분증 이미지, 계좌 비밀번호 등 민감정보 저장 금지
- 휴대전화 등 개인정보는 꼭 필요한 범위만 수집
<!-- fresh pages deployment 2026-07-31 -->
