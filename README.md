# 나도 Teachers

나도 선생님 전용 운영 사이트입니다. 기존 나도 학생용 사이트의 파란색·네이비 브랜드 스타일을 유지하면서, 정보 전달보다 실제 업무 처리를 우선한 대시보드 형태로 구성했습니다.

## 포함된 기능

- 선생님 이메일/비밀번호 로그인
- 주간 가능 스케줄 여러 개 등록, 수정, 저장
- 선생님별 스케줄 데이터 분리
- 관리자 전체 스케줄 조회 및 CSV 다운로드
- 공지사항
- 첫 수업 체크리스트
- 커리큘럼/PDF/Google Drive 자료 링크
- YouTube 교육 영상 임베드
- 선생님 프로필 관리
- 모바일 반응형 화면

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

### 커리큘럼/PDF

PDF를 Google Drive 등에 올린 뒤 공유 링크를 `resources.file_url`에 넣습니다.

- title: 자료 제목
- description: 설명
- category: `PDF`, `DOC`, `LINK` 등
- file_url: 공유 링크
- sort_order: 표시 순서
- is_active: 노출 여부

Google Drive 공유 설정은 반드시 `링크가 있는 사용자에게 보기 허용`으로 설정해야 합니다.

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
