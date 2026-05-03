import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { chunkText, generateEmbedding } from '@/lib/ai/embeddings'

// ─── Seed data ────────────────────────────────────────────────────────────────

const BOARD_MEMBERS = [
  { email: 'sarah.lim@nrcs.sg',    full_name: 'Sarah Lim',    role: 'board_member', password: 'NRCSDemo2026!' },
  { email: 'michael.chen@nrcs.sg', full_name: 'Michael Chen', role: 'board_member', password: 'NRCSDemo2026!' },
  { email: 'rachel.wong@nrcs.sg',  full_name: 'Rachel Wong',  role: 'board_member', password: 'NRCSDemo2026!' },
  { email: 'james.ong@nrcs.sg',    full_name: 'James Ong',    role: 'board_member', password: 'NRCSDemo2026!' },
  { email: 'linda.koh@nrcs.sg',    full_name: 'Linda Koh',    role: 'board_member', password: 'NRCSDemo2026!' },
]

const DEMO_DOCUMENTS = [
  {
    title: 'NRCS Board Charter & Governance Code',
    category: 'By-laws',
    description: 'Governing document setting out board composition, responsibilities, meeting procedures, and conflict-of-interest rules.',
    document_date: '2024-01-01',
    extracted_text: `NRCS BOARD CHARTER & GOVERNANCE CODE (2024 Edition)

1. BOARD COMPOSITION
The Board shall consist of not fewer than 7 and not more than 12 members. Board terms are 2 years, renewable up to 3 consecutive terms. At least one-third of board seats must be vacated at each AGM.

2. ROLES & RESPONSIBILITIES
Chairman: Presides over all board meetings, signs board resolutions, represents NRCS externally.
Treasurer: Oversees financial management, presents quarterly financial reports, chairs the Finance Committee.
Secretary: Maintains board records, issues meeting notices, files regulatory returns.

3. QUORUM & VOTING
A quorum is constituted by the presence of not less than half of the board members. Decisions shall be made by simple majority. Special resolutions (constitutional amendments, dissolution) require a two-thirds majority of the full board.

4. MEETINGS
The board shall meet at least once per quarter. Special meetings may be called by the Chairman or any two board members with at least 7 days written notice. Board papers must be circulated no less than 3 business days before a meeting.

5. COMMITTEES
The board may establish: (a) Finance Committee — Treasurer chairs, reviews budgets and financial reports; (b) Audit Committee — independent member chairs, reviews audit findings; (c) HR Committee — oversees staff and volunteer policies.

6. CONFLICT OF INTEREST
Board members must declare any actual or potential conflict of interest at the start of each meeting and in the annual Conflict of Interest Declaration. Members must abstain from discussion and voting on matters in which they have a personal or financial interest.

7. PROCUREMENT THRESHOLDS
Below $5,000: Executive Director authority. $5,001–$50,000: Finance Committee approval with 3 quotations. Above $50,000: Full Board resolution required. Renovation or capital projects above $100,000 require an independent cost review.

8. BOARD EFFECTIVENESS
An annual board effectiveness self-assessment shall be conducted. Results presented to the full board. Recommendations for improvement actioned within 3 months.`,
  },
  {
    title: 'Financial Management Standard Operating Procedure',
    category: 'SOP',
    description: 'Operational procedures for budgeting, procurement, disbursement, grant management, and audit.',
    document_date: '2024-03-01',
    extracted_text: `FINANCIAL MANAGEMENT SOP — Version 3.2 (March 2024)

1. BUDGET CYCLE
Annual budgets are prepared by the Finance Manager in September, reviewed by the Finance Committee in October, and approved by the full Board in November. Supplementary budgets may be submitted for board approval at any regular meeting. Budget variances exceeding 15% of a line item require a written explanation and supplementary budget resolution.

2. PROCUREMENT PROCEDURES
Tier 1 (below $1,000): Single quotation, Executive Director or Finance Manager sign-off.
Tier 2 ($1,000–$10,000): Two written quotations, Finance Manager sign-off.
Tier 3 ($10,001–$50,000): Three written quotations, Finance Committee sign-off.
Tier 4 (above $50,000): Three written quotations, full Board resolution, independent cost verification recommended.
Emergency procurement: Executive Director may approve up to $20,000 without quotations in genuine emergencies; ratification required at next board meeting.

3. PAYMENT AUTHORISATION
All payments above $5,000 require dual approval. Payments above $20,000 require Chairman or Treasurer countersignature. GIRO and online banking transactions require two-factor authentication with dual approver.

4. GRANT MANAGEMENT
Each grant must have a dedicated cost centre. Grant funds must not be co-mingled with general operating funds. Quarterly utilisation reports prepared for all grants above $50,000. Unspent grant funds returned to funder unless carry-forward is approved in writing.

5. RESERVES POLICY
General operating reserves shall be maintained at a minimum of 6 months of operating expenditure. Restricted reserves held in separate accounts. The board shall review the reserves policy annually.

6. ANNUAL AUDIT
Financial year ends 31 March. Auditors appointed by the board, independent of management. Audit completed within 3 months of year end. Audited accounts presented to the board and filed with the Commissioner of Charities within 6 months.`,
  },
  {
    title: 'Volunteer Engagement Policy',
    category: 'Policy',
    description: 'Policy governing volunteer recruitment, onboarding, supervision, recognition, and termination.',
    document_date: '2023-09-01',
    extracted_text: `VOLUNTEER ENGAGEMENT POLICY — Revised September 2023

PURPOSE
This policy ensures that NRCS provides consistent, safe, and rewarding volunteering experiences aligned with the organisation's values and regulatory requirements.

ELIGIBILITY
Volunteers must be at least 15 years of age. Those under 18 require written parental/guardian consent. Volunteers in roles involving direct contact with vulnerable persons (children, elderly, persons with mental health conditions) must undergo enhanced background screening including criminal record checks.

RECRUITMENT & ONBOARDING
All volunteers complete a mandatory 4-hour orientation covering: NRCS mission and values, volunteer rights and responsibilities, data protection (PDPA), safeguarding policy, emergency procedures, and role-specific training. Volunteer data stored in VIMS (Volunteer Information Management System) and handled per PDPA requirements.

SUPERVISION
Each volunteer is assigned a staff supervisor. Volunteers may not have unsupervised one-to-one contact with beneficiaries. Home visits require at least two volunteers or one volunteer plus a staff member.

HOURS & RECOGNITION
Volunteer hours logged in VIMS by the supervising staff member. Annual recognition: Certificate of Appreciation (50+ hours), Long Service Award (250, 500, 1000 hours). Annual Volunteer Appreciation Dinner held in November. Community service letters provided on request.

HEALTH & SAFETY
All volunteers covered under Group Personal Accident insurance for approved activities. Volunteers must report injuries within 24 hours. Volunteers with infectious conditions must not attend. PPE provided where required.

TERMINATION
Volunteer engagement may be terminated for: conduct unbecoming, breach of confidentiality, repeated unexplained absence (3+ sessions), or policy violations. Volunteers may appeal to the Executive Director within 14 days.`,
  },
  {
    title: 'Annual Report FY2025',
    category: 'Board Paper',
    description: 'Audited annual report for financial year ending 31 March 2025, including programme outcomes and financial statements.',
    document_date: '2025-06-30',
    extracted_text: `NRCS ANNUAL REPORT FY2025 (Year Ended 31 March 2025)

CHAIRPERSON'S MESSAGE
FY2025 was a milestone year for NRCS. We expanded our counselling services to two new centres, achieved our highest volunteer participation rate in five years, and maintained a strong financial position. We thank our donors, volunteers, and staff for their unwavering commitment to the community.

PROGRAMMES & IMPACT
Counselling Services: 1,891 sessions delivered to 512 unique clients. Average wait time reduced from 4 weeks to 9 days. Three counsellors trained in trauma-informed care.
Community Outreach: 312 home visits to elderly residents. 2,140 seniors reached through our Senior Connect programme.
Crisis Intervention: 147 crisis cases handled, 96.6% resolved with positive outcomes.
Volunteer Programme: 387 active volunteers, 18,432 hours contributed. 42 new volunteers inducted.

FINANCIAL SUMMARY
Total Revenue: $1,368,450
— Government Grants & Subsidies: $742,000 (54.2%)
— Community Chest & Donations: $384,000 (28.1%)
— Service Fees & Other Income: $242,450 (17.7%)

Total Expenditure: $1,189,760
— Programme & Service Delivery: $956,200 (80.4%)
— Administration & Governance: $233,560 (19.6%)

Operating Surplus: $178,690
Accumulated Reserves: $1,071,130 (10.8 months coverage)

KEY DECISIONS IN FY2025
The board approved an expanded counselling service mandate, a new safeguarding framework for volunteers, and the appointment of three new board members. The board also commissioned a feasibility study for the Bukit Timah Centre renovation, with results presented in Q1 FY2026.

OUTLOOK FY2026
Planned initiatives: Bukit Timah Centre renovation ($220,000 approved in principle), counselling service expansion to underserved communities, Gala 2026 fundraising campaign (target: $400,000), and recruitment of two additional board members.`,
  },
  {
    title: 'Bukit Timah Centre Renovation — Project Brief',
    category: 'Board Paper',
    description: 'Renovation scope, cost estimates, contractor selection process, and timeline for the Bukit Timah service centre.',
    document_date: '2026-02-15',
    extracted_text: `BUKIT TIMAH CENTRE RENOVATION — PROJECT BRIEF (February 2026)

BACKGROUND
The Bukit Timah Centre has been operational since 2012. A facilities audit conducted in October 2025 identified structural deficiencies, inadequate disability access, and poor energy efficiency. The board approved a feasibility study in FY2025, with results recommending full renovation.

SCOPE OF WORKS
Phase 1 (Structural & Safety): Repair structural cracks in ground floor, upgrade fire suppression system, replace electrical switchboard. Estimated cost: $65,000.
Phase 2 (Accessibility): Install lift (DDA-compliant), widen doorways to 900mm, install accessible toilets on all floors. Estimated cost: $82,000.
Phase 3 (Interior & Fit-out): Counselling rooms sound-proofing upgrade (6 rooms), new reception area, staff workstations, flooring replacement. Estimated cost: $53,000.
Contingency (10%): $20,000.
Total Estimated Budget: $220,000.

CONTRACTOR SELECTION PROCESS
Per Financial Management SOP, three written quotations required. The Finance Committee recommended a budget cap of $220,000. Quotations received from: BuildRight Pte Ltd ($198,500), Covenant Construction ($211,200), SkyBuild Contractors ($236,800). Board to approve engagement of preferred contractor.

PROJECT TIMELINE
Q2 FY2026 (Apr–Jun): Contractor engagement and detailed planning.
Q3 FY2026 (Jul–Sep): Phase 1 and Phase 2 works.
Q4 FY2026 (Oct–Dec): Phase 3 works and fit-out.
Q1 FY2027 (Jan–Mar): Snagging, handover, and reopening.

RISKS
Disruption to ongoing counselling services during construction: Mitigated by temporary relocation of 2 counselling rooms to Queenstown Centre.
Cost overrun: Contingency budget of $20,000 set aside. Material cost fluctuations tracked monthly.`,
  },
  {
    title: 'Counselling Service Expansion Proposal',
    category: 'Board Paper',
    description: 'Proposal to expand counselling services to Jurong West, including resource requirements, funding plan, and expected outcomes.',
    document_date: '2026-03-05',
    extracted_text: `COUNSELLING SERVICE EXPANSION PROPOSAL — Jurong West Community Centre

EXECUTIVE SUMMARY
This proposal recommends establishing a satellite counselling service at Jurong West Community Centre (JWCC), serving an estimated 200–250 additional clients annually by Year 2. Total additional budget required: $156,000 per annum.

NEEDS ASSESSMENT
Analysis of referral data from IMH and SOS shows a 34% increase in demand from Jurong West residents over the past 18 months. Current NRCS centres in Bukit Timah and Queenstown are fully utilised with wait times exceeding 3 weeks. JWCC has offered a co-location arrangement at subsidised rent of $1,200/month.

PROPOSED SERVICE MODEL
Three-day-a-week service (Tue, Thu, Sat) at JWCC. Two counsellors per session. Initial intake assessment and referral management handled by trained volunteers. Caseload target: 15–20 sessions per week by Month 6.

RESOURCE REQUIREMENTS
Staffing: 1.5 FTE counsellors ($96,000 p.a. incl. CPF), 0.5 FTE coordinator ($24,000 p.a.).
Premises: $14,400/year (JWCC subsidised rate).
Equipment & Fit-out (one-off): $18,000.
Indirect costs (IT, insurance, overhead): $21,600/year.
Total Year 1: $174,000 (incl. one-off fit-out).
Total Year 2 onwards: $156,000 p.a.

FUNDING PLAN
Seeking Community Silver Fund top-up: $80,000 p.a. (application pending).
Tote Board grant application: $40,000 p.a.
NRCS programme funding contribution: $36,000 p.a.
Expected break-even: Month 18.

RECOMMENDATION
The Board is invited to approve the Jurong West Expansion in principle, subject to: (1) confirmation of JWCC co-location agreement, (2) successful grant applications, (3) appointment of lead counsellor. Implementation from July 2026.`,
  },
  {
    title: 'Gala 2026 Fundraising Campaign — Campaign Brief',
    category: 'Board Paper',
    description: 'Annual gala fundraising event plan including venue, programme, fundraising target, sponsorship strategy, and responsibilities.',
    document_date: '2026-03-20',
    extracted_text: `GALA 2026 — "HEARTS THAT HEAL" FUNDRAISING CAMPAIGN BRIEF

EVENT OVERVIEW
Date: Saturday, 15 August 2026 | Venue: TBD (shortlist: Shangri-La Singapore, The Fullerton Hotel, Sands Expo)
Format: Gala dinner, 300–350 pax, seated. Programme includes charity auction, live entertainment, and impact video showcase.
Fundraising Target: $400,000 (net of event costs)

PROGRAMME OUTLINE
6:00 PM — Arrival & networking reception
7:00 PM — Welcome address by Chairman
7:15 PM — Impact showcase (video + beneficiary testimonial)
7:45 PM — Dinner service (3-course)
8:30 PM — Charity auction (target: $80,000)
9:30 PM — Live entertainment & raffle draw
10:00 PM — Close

SPONSORSHIP STRATEGY
Platinum Sponsor ($50,000+): Naming rights, 2 tables, full-page programme ad, on-stage recognition.
Gold Sponsor ($25,000): 1 table, half-page ad, MC recognition.
Silver Sponsor ($10,000): 4 seats, acknowledgment in programme.
Table Purchasers ($3,000/table): Corporate and individual table sales. Target: 20 tables @ $3,000 = $60,000.

FUNDRAISING BREAKDOWN (Target)
Corporate sponsorships (4 × Platinum, 6 × Gold, 10 × Silver): $400,000
Table sales: $60,000
Charity auction: $80,000
Raffle: $20,000
Gross target: $560,000 | Event costs: $160,000 | Net target: $400,000

RESPONSIBILITIES
Linda Koh (Fundraising Chair): Sponsor outreach, corporate network. Michael Chen (Events): Venue and vendor management. Admin team: Invitations, RSVP, logistics. Board members: Each board member to personally secure minimum 1 sponsor or 2 tables.

TIMELINE
March 2026: Board approval, appoint event committee.
April–May: Venue confirmation, sponsor outreach.
June: Invitations sent, programme finalised.
July: Rehearsals, AV production.
August 15: Event night.`,
  },
  {
    title: 'Q1 FY2026 Financial Report',
    category: 'Finance',
    description: 'Unaudited quarterly financial report for April–June 2026, including income statement, budget variance, and reserves update.',
    document_date: '2026-04-15',
    extracted_text: `Q1 FY2026 FINANCIAL REPORT (April – June 2026)
Prepared by: Finance Committee | Reviewed by: Treasurer Sarah Lim

INCOME STATEMENT (Q1 FY2026)
Revenue:
MOH Mental Health Grant (Q1 drawdown): $155,000
Community Chest Allocation: $62,500
Service Fees (counselling): $38,750
Donation Income: $24,380
Total Revenue: $280,630

Expenditure:
Staff Costs (salaries, CPF, benefits): $174,200
Programme Costs (materials, transport, subcontractors): $48,600
Premises & Utilities: $18,400
Administrative & Governance: $22,100
Depreciation: $8,500
Total Expenditure: $271,800

Operating Surplus Q1: $8,830

BUDGET VARIANCE ANALYSIS
Staff Costs: +$4,200 (1.2%) — within tolerance. Variance due to one staff increment in April.
Programme Costs: +$6,800 (16.3%) — above 15% threshold. Note: Early procurement for Bukit Timah renovation planning. Finance Committee approves variance.
Premises: on budget.

RESERVES POSITION
General Reserves as at 31 March 2026: $1,071,130
Less: Renovation Project Reserve (board-approved): ($220,000)
Less: Counselling Expansion Seed Fund: ($40,000)
Available Free Reserves: $811,130 (8.2 months operating costs)

GRANTS STATUS
MOH Mental Health Initiative (Total: $620,000, Year 2 of 3): On track. Q1 utilisation report submitted.
Community Silver Fund application (Jurong West): Under evaluation. Decision expected June 2026.
Tote Board Community Grant: Application submitted March 2026. Decision expected July 2026.`,
  },
  {
    title: 'MOH Mental Health Grant Application FY2026/27',
    category: 'Grant',
    description: 'Application for renewal of MOH Mental Health Community Services grant, including programme outcomes and budget justification.',
    document_date: '2025-12-01',
    extracted_text: `MOH MENTAL HEALTH COMMUNITY SERVICES GRANT — RENEWAL APPLICATION FY2026/27

SECTION 1: ORGANISATIONAL PROFILE
Organisation: National Red Cross Society (NRCS) Singapore. Registration: ROS/UEN 196400192H. Year established: 1949. Annual revenue (FY2025): $1,368,450.

SECTION 2: PROGRAMME OVERVIEW
Programme: NRCS Counselling & Crisis Support Service. Service since: 2008. Coverage: Bukit Timah, Queenstown (Jurong West from July 2026 pending approval). Target beneficiaries: Low-income adults with mild-moderate mental health conditions, crisis cases, caregivers of persons with dementia.

SECTION 3: OUTCOMES ACHIEVED (FY2025)
Clients served: 512 (target: 450 — exceeded by 13.8%)
Counselling sessions: 1,891 (target: 1,600 — exceeded by 18.2%)
Crisis cases resolved within 48 hours: 96.6% (target: 90%)
Client satisfaction rating: 4.6/5.0 (target: 4.0)
Subsidised clients (MSF/SSO referrals): 67% of caseload

SECTION 4: PROPOSED ACTIVITIES FY2026/27
Continue existing counselling services at Bukit Timah and Queenstown centres. Launch Jurong West satellite service (subject to board and funder approval). Train 3 additional counsellors in dialectical behaviour therapy (DBT). Implement digital intake system to reduce administrative burden by 30%.

SECTION 5: BUDGET REQUESTED
Staff (2.5 FTE counsellors, 0.5 FTE coordinator): $312,000
Premises and utilities: $43,200
Training and professional development: $18,000
Indirect costs (IT, insurance, administration, 15%): $55,980
Total Grant Request: $429,180

SECTION 6: DECLARATION
We confirm that the information provided is accurate. We acknowledge that misrepresentation may result in grant withdrawal and recovery of funds disbursed.
Signed: Daniel Tan, Chairman | Sarah Lim, Treasurer`,
  },
]

type MeetingData = {
  title: string
  meeting_date: string
  status: 'scheduled' | 'draft_minutes' | 'approved' | 'cancelled'
  agenda_json: { item: string; presenter?: string }[]
  attendees_names: string[]
  absentees_names: string[]
  draft_minutes?: string
  transcript_text?: string
  final_minutes?: string
}

const MEETINGS_DATA: MeetingData[] = [
  {
    title: 'Board Meeting – November 2025',
    meeting_date: '2025-11-20T09:00:00+08:00',
    status: 'approved',
    attendees_names: ['Daniel Tan', 'Sarah Lim', 'Michael Chen', 'Rachel Wong', 'James Ong', 'Linda Koh'],
    absentees_names: [],
    agenda_json: [
      { item: 'Confirmation of previous minutes', presenter: 'James Ong' },
      { item: 'FY2026 budget planning — first review', presenter: 'Sarah Lim' },
      { item: 'Staff performance appraisal outcomes', presenter: 'Rachel Wong' },
      { item: 'Volunteer appreciation dinner — update', presenter: 'Linda Koh' },
      { item: 'Any other business' },
    ],
    final_minutes: `NRCS BOARD MEETING MINUTES — 20 November 2025

Present: Daniel Tan (Chair), Sarah Lim (Treasurer), Michael Chen, Rachel Wong (HR Chair), James Ong (Secretary), Linda Koh (Fundraising Chair)

1. PREVIOUS MINUTES: Minutes of the September 2025 board meeting were confirmed as a true record. Proposed: Sarah Lim. Seconded: Michael Chen.

2. FY2026 BUDGET: Treasurer presented the preliminary FY2026 budget. Total projected expenditure: $1.24M. Board requested Finance Committee to review programme cost allocations and resubmit at the December meeting. Action: Sarah Lim to circulate revised draft by 30 November 2025.

3. STAFF APPRAISALS: HR Chair reported 8 out of 9 staff received "meets expectations" or above. One staff member on performance improvement plan. Board noted satisfactory outcome.

4. VOLUNTEER APPRECIATION DINNER: Linda Koh confirmed venue (Marina Bay Sands, Level 1) and programme for 28 November 2025. 127 volunteers confirmed attendance. Budget: $18,500.

5. NEXT MEETING: 18 December 2025 at 9:00am. James Ong to circulate notice by 5 December 2025.

Meeting closed at 11:45am.`,
  },
  {
    title: 'Board Meeting – December 2025',
    meeting_date: '2025-12-18T09:00:00+08:00',
    status: 'approved',
    attendees_names: ['Daniel Tan', 'Sarah Lim', 'Michael Chen', 'Rachel Wong', 'James Ong', 'Linda Koh'],
    absentees_names: [],
    agenda_json: [
      { item: 'FY2026 budget — final approval', presenter: 'Sarah Lim' },
      { item: 'Year-end financial update', presenter: 'Sarah Lim' },
      { item: 'Board charter review — first reading', presenter: 'Daniel Tan' },
      { item: 'MOH grant renewal — submission approval', presenter: 'Michael Chen' },
      { item: 'Any other business' },
    ],
    final_minutes: `NRCS BOARD MEETING MINUTES — 18 December 2025

Present: All board members.

1. FY2026 BUDGET APPROVED: The revised FY2026 budget of $1,241,600 was presented by the Treasurer. After discussion, the board resolved to approve the budget as presented. Proposed: Sarah Lim. Seconded: Linda Koh. Carried unanimously.

2. YEAR-END FINANCIALS: Revenue tracking ahead of target by 4.2%. Reserves at 10.8 months. Operating surplus for 9 months of FY2025: $147,320.

3. BOARD CHARTER REVIEW: Chairman presented proposed amendments to the Conflict of Interest and Procurement sections. Board requested a legal review before final adoption. Action: Daniel Tan to engage NRCS legal panel. Timeline: February 2026.

4. MOH GRANT RENEWAL: Board approved submission of the MOH Mental Health Community Services Grant renewal application for FY2026/27, requesting $429,180. Action: Michael Chen to finalise and submit by 5 January 2026.

5. EMERGENCY CONTACT UPDATE: Secretary noted the emergency contact directory was last updated in 2023. Action: James Ong to update and circulate by 28 February 2026.

Meeting closed at 12:00pm.`,
  },
  {
    title: 'AGM FY2025',
    meeting_date: '2026-01-22T18:00:00+08:00',
    status: 'approved',
    attendees_names: ['Daniel Tan', 'Sarah Lim', 'Michael Chen', 'Rachel Wong', 'James Ong', 'Linda Koh'],
    absentees_names: [],
    agenda_json: [
      { item: 'Opening and confirmation of quorum' },
      { item: 'Annual Report FY2025 — presentation and adoption', presenter: 'Daniel Tan' },
      { item: 'Audited accounts FY2025 — approval', presenter: 'Sarah Lim' },
      { item: 'Appointment of auditors for FY2026' },
      { item: 'Board elections — return of existing members', presenter: 'James Ong' },
      { item: 'Q&A from members' },
    ],
    final_minutes: `AGM MINUTES — 22 January 2026 | Attended by 38 Ordinary Members

Annual Report FY2025 adopted. Audited accounts approved (surplus $178,690, reserves $1,071,130). KPMG reappointed as auditors for FY2026. All existing board members returned unopposed. Chairman thanked retiring volunteer coordinator Peggy Tan for 12 years of service. Next AGM scheduled Q1 2027.`,
  },
  {
    title: 'Board Meeting – February 2026',
    meeting_date: '2026-02-19T09:00:00+08:00',
    status: 'approved',
    attendees_names: ['Daniel Tan', 'Sarah Lim', 'Michael Chen', 'Rachel Wong', 'James Ong'],
    absentees_names: ['Linda Koh'],
    agenda_json: [
      { item: 'Renovation feasibility study results', presenter: 'Michael Chen' },
      { item: 'Board charter — legal review findings', presenter: 'Daniel Tan' },
      { item: 'Board recruitment plan', presenter: 'Daniel Tan' },
      { item: 'HR policy updates — annual review', presenter: 'Rachel Wong' },
      { item: 'Any other business' },
    ],
    final_minutes: `NRCS BOARD MEETING MINUTES — 19 February 2026

Present: Daniel Tan (Chair), Sarah Lim (Treasurer), Michael Chen, Rachel Wong (HR), James Ong (Secretary). Apologies: Linda Koh.

1. RENOVATION FEASIBILITY: Michael Chen presented the renovation feasibility study for Bukit Timah Centre. Estimated total cost: $200,000–$220,000. Board resolved to proceed with Phase 1 planning and invite contractor quotations. Finance Committee to set a budget cap of $220,000 for board approval.

2. BOARD CHARTER AMENDMENTS: Legal review recommends adoption of revised Conflict of Interest and Procurement clauses. Board agreed in principle. Action: James Ong to circulate final draft for board sign-off by March 2026.

3. BOARD RECRUITMENT: Chairman reported 2 board vacancies (Linda Koh completing final term in December 2026). Action: Daniel Tan to prepare board skills matrix and initiate recruitment process. Target: shortlist 3 candidates by end of May 2026.

4. HR POLICY: Annual review of Volunteer Engagement Policy completed. Minor amendments to the termination clause. Adopted with amendments.

Meeting closed at 11:30am.`,
  },
  {
    title: 'Board Meeting – March 2026',
    meeting_date: '2026-03-19T09:00:00+08:00',
    status: 'approved',
    attendees_names: ['Daniel Tan', 'Sarah Lim', 'Michael Chen', 'Rachel Wong', 'James Ong', 'Linda Koh'],
    absentees_names: [],
    agenda_json: [
      { item: 'Renovation budget approval', presenter: 'Sarah Lim' },
      { item: 'Counselling service expansion — proposal tabling', presenter: 'Michael Chen' },
      { item: 'Gala 2026 — campaign brief approval', presenter: 'Linda Koh' },
      { item: 'Q1 FY2026 financial preview', presenter: 'Sarah Lim' },
      { item: 'Any other business' },
    ],
    final_minutes: `NRCS BOARD MEETING MINUTES — 19 March 2026

Present: All board members.

1. RENOVATION BUDGET: Three quotations received (BuildRight $198,500, Covenant $211,200, SkyBuild $236,800). Finance Committee recommends BuildRight subject to reference checks. Board resolved to approve renovation budget of $220,000 (inclusive of 10% contingency) and authorise the Finance Committee to finalise the contract. Proposed: Sarah Lim. Seconded: James Ong. Carried 6–0.

2. COUNSELLING EXPANSION: Michael Chen tabled the Jurong West expansion proposal. Board noted the proposal favourably. Resolution tabled for e-vote given funding conditions precedent. To be circulated for approval by end of March 2026.

3. GALA 2026: Campaign brief approved. Linda Koh appointed as Campaign Chair. Budget cap $160,000 event costs. Net fundraising target $400,000. Venue to be confirmed by May 2026.

4. Q1 FINANCIAL PREVIEW: Revenue on track. Note: programme cost variance of 16.3% due to renovation planning; Finance Committee approves.

Meeting closed at 12:15pm.`,
  },
  {
    title: 'Finance Committee Meeting – April 2026',
    meeting_date: '2026-04-10T10:00:00+08:00',
    status: 'draft_minutes',
    attendees_names: ['Sarah Lim', 'Daniel Tan'],
    absentees_names: ['Michael Chen'],
    agenda_json: [
      { item: 'Q1 FY2026 financial report review', presenter: 'Sarah Lim' },
      { item: 'Renovation contract — BuildRight reference check', presenter: 'Sarah Lim' },
      { item: 'Grant pipeline update', presenter: 'Sarah Lim' },
      { item: 'FY2026/27 preliminary budget parameters' },
    ],
    draft_minutes: `FINANCE COMMITTEE MEETING — 10 April 2026 (DRAFT MINUTES, PENDING APPROVAL)

Present: Sarah Lim (Chair), Daniel Tan. Apologies: Michael Chen.

1. Q1 FINANCIAL REPORT: Q1 FY2026 report reviewed. Surplus of $8,830 noted. Programme cost variance of 16.3% approved as explained in prior board meeting. Report recommended for circulation to full board.

2. RENOVATION — BUILDRIGHT: Reference checks completed. BuildRight Pte Ltd — 2 referees gave positive feedback. No outstanding court judgements. Finance Committee recommends formalising letter of intent. Action: Sarah Lim to prepare LOI for Chairman's signature by 30 April 2026.

3. GRANT PIPELINE: Community Silver Fund (JWCC) — decision expected June 2026. Tote Board — submitted March 2026, decision July 2026. MOH renewal — acknowledged, assessment in progress.

4. FY2026/27 BUDGET PARAMETERS: Operating cost baseline $1.3M + Jurong West expansion $156K if approved. Finance Manager to commence preliminary budget by 1 September 2026.

Note: Draft minutes circulated for review. To be ratified at next committee meeting or full board.`,
  },
  {
    title: 'Board Meeting – May 2026',
    meeting_date: '2026-05-15T09:00:00+08:00',
    status: 'scheduled',
    attendees_names: [],
    absentees_names: [],
    agenda_json: [
      { item: 'Confirmation of April Finance Committee minutes', presenter: 'Sarah Lim' },
      { item: 'Renovation — BuildRight contract execution', presenter: 'Sarah Lim' },
      { item: 'Counselling expansion — grant update & final approval', presenter: 'Michael Chen' },
      { item: 'Gala 2026 — venue confirmation & sponsor pipeline', presenter: 'Linda Koh' },
      { item: 'Board recruitment — candidate shortlist', presenter: 'Daniel Tan' },
      { item: 'Any other business' },
    ],
  },
  {
    title: 'AGM 2026 Planning Meeting',
    meeting_date: '2026-06-03T10:00:00+08:00',
    status: 'scheduled',
    attendees_names: [],
    absentees_names: [],
    agenda_json: [
      { item: 'AGM date and venue confirmation' },
      { item: 'Nomination process for board vacancies' },
      { item: 'Annual Report FY2026 timeline' },
      { item: 'Proxy form and notice drafting', presenter: 'James Ong' },
    ],
  },
]

type ActionItemData = {
  title: string
  description?: string
  owner_email: string
  due_date: string
  status: 'Not Started' | 'In Progress' | 'Done' | 'Blocked'
  meeting_title?: string
  notes?: string
}

const ACTION_ITEMS_DATA: ActionItemData[] = [
  // Overdue items (critical for dashboard)
  { title: 'Finalise renovation contractor shortlist and reference checks', description: 'BuildRight Pte Ltd reference check completed. Obtain formal verification and prepare LoI.', owner_email: 'sarah.lim@nrcs.sg', due_date: '2026-04-25', status: 'In Progress', meeting_title: 'Board Meeting – March 2026', notes: 'Reference check done. LoI draft in progress.' },
  { title: 'Complete legal review of board charter amendments', description: 'Engage NRCS legal panel to review revised Conflict of Interest and Procurement clauses.', owner_email: 'daniel@nrcs.sg', due_date: '2026-04-20', status: 'Not Started', meeting_title: 'Board Meeting – December 2025', notes: 'Legal panel engaged but review delayed.' },
  { title: 'Update volunteer onboarding checklist per revised policy', description: 'Revise checklist to reflect September 2023 policy amendments on background checks.', owner_email: 'rachel.wong@nrcs.sg', due_date: '2026-04-28', status: 'Blocked', meeting_title: 'Board Meeting – February 2026', notes: 'Blocked pending HR system access for volunteer database update.' },

  // In Progress — upcoming
  { title: 'Obtain 3 renovation contractor quotations', description: 'Shortlist from feasibility study. Invite BuildRight, Covenant, and SkyBuild to submit formal tenders.', owner_email: 'michael.chen@nrcs.sg', due_date: '2026-05-15', status: 'Done', meeting_title: 'Board Meeting – February 2026', notes: 'All 3 quotes received. BuildRight lowest at $198,500.' },
  { title: 'Circulate final board charter draft for board sign-off', description: 'Distribute revised charter to all board members for review and email confirmation.', owner_email: 'james.ong@nrcs.sg', due_date: '2026-05-10', status: 'In Progress', meeting_title: 'Board Meeting – February 2026' },
  { title: 'Confirm Gala 2026 venue booking', description: 'Shortlist: Shangri-La, Fullerton Hotel, Sands Expo. Confirm venue and sign contract.', owner_email: 'linda.koh@nrcs.sg', due_date: '2026-05-08', status: 'In Progress', meeting_title: 'Board Meeting – March 2026', notes: 'Awaiting Fullerton Hotel revised proposal.' },
  { title: 'Board recruitment — shortlist 3 board candidate profiles', description: 'Review applications received via NVPC board match and personal referrals.', owner_email: 'daniel@nrcs.sg', due_date: '2026-05-30', status: 'In Progress', meeting_title: 'Board Meeting – February 2026', notes: '7 applications received, 3 interviews scheduled.' },
  { title: 'Draft counselling service expansion implementation plan', description: 'Prepare staffing plan, fit-out schedule, and service launch timeline for Jurong West.', owner_email: 'michael.chen@nrcs.sg', due_date: '2026-05-20', status: 'In Progress', meeting_title: 'Board Meeting – March 2026' },

  // Not Started — upcoming
  { title: 'Prepare AGM 2026 notice, agenda, and proxy form', description: 'Draft notice per constitution requirements. Minimum 14 days notice to all ordinary members.', owner_email: 'james.ong@nrcs.sg', due_date: '2026-05-20', status: 'Not Started', meeting_title: 'Finance Committee Meeting – April 2026' },
  { title: 'Review and renew volunteer group personal accident insurance', description: 'Current policy expires 31 July 2026. Obtain 3 quotes and present to Finance Committee.', owner_email: 'sarah.lim@nrcs.sg', due_date: '2026-05-25', status: 'Not Started', meeting_title: 'Finance Committee Meeting – April 2026' },
  { title: 'Update PDPA data protection register — annual review', description: 'Review all data collection activities, update register, and confirm appointed DPO.', owner_email: 'rachel.wong@nrcs.sg', due_date: '2026-06-01', status: 'Not Started', meeting_title: 'Finance Committee Meeting – April 2026' },
  { title: 'Secure venue booking for AGM 2026', description: 'Target capacity: 60–80. Budget: $3,000. Options: NRCS training room, CDC, community clubs.', owner_email: 'james.ong@nrcs.sg', due_date: '2026-06-15', status: 'Not Started', meeting_title: 'Finance Committee Meeting – April 2026' },
  { title: 'Prepare FY2026/27 preliminary budget framework', description: 'Based on Finance Committee parameters. Include Jurong West expansion, renovation cost recovery.', owner_email: 'sarah.lim@nrcs.sg', due_date: '2026-05-31', status: 'Not Started', meeting_title: 'Finance Committee Meeting – April 2026' },
  { title: 'Conduct board effectiveness self-assessment (annual)', description: 'Distribute anonymous questionnaire to board. Compile results and present at June board meeting.', owner_email: 'daniel@nrcs.sg', due_date: '2026-06-30', status: 'Not Started' },

  // Done items
  { title: 'Submit Q1 grant progress report to MOH', description: 'Quarterly utilisation report for MOH Mental Health Community Services grant.', owner_email: 'sarah.lim@nrcs.sg', due_date: '2026-04-15', status: 'Done', meeting_title: 'Board Meeting – March 2026', notes: 'Submitted on 12 April 2026. Acknowledged by MOH on 14 April.' },
  { title: 'Annual Report FY2025 — board sign-off', description: 'Obtain board signatures on final audited annual report before filing with COC.', owner_email: 'daniel@nrcs.sg', due_date: '2026-03-30', status: 'Done', meeting_title: 'Board Meeting – February 2026', notes: 'Signed by all board members. Filed with COC on 28 March 2026.' },
  { title: 'Submit CPF contributions for Q1 FY2026', description: 'Ensure all Q1 CPF contributions submitted before monthly deadline.', owner_email: 'sarah.lim@nrcs.sg', due_date: '2026-04-07', status: 'Done', meeting_title: 'Board Meeting – March 2026', notes: 'Submitted via CPF e-Submit on 4 April 2026.' },
  { title: 'Conduct volunteer satisfaction survey 2026', description: 'Annual survey sent to all 387 active volunteers. Minimum 60% response rate target.', owner_email: 'rachel.wong@nrcs.sg', due_date: '2026-03-15', status: 'Done', meeting_title: 'Board Meeting – February 2026', notes: '74% response rate achieved. Results presented to board. Overall satisfaction: 4.3/5.' },
  { title: 'Update board emergency contact directory', description: 'Refresh contact details for all board members and key staff.', owner_email: 'james.ong@nrcs.sg', due_date: '2026-02-28', status: 'Done', meeting_title: 'Board Meeting – December 2025', notes: 'Completed and circulated on 25 February 2026.' },
  { title: 'Circulate revised conflict-of-interest policy for acknowledgement', description: 'All board members to sign updated COI declaration forms for FY2026.', owner_email: 'james.ong@nrcs.sg', due_date: '2026-01-31', status: 'Done', meeting_title: 'AGM FY2025', notes: 'All 6 board members signed. Forms filed with Secretary.' },
  { title: 'Submit Annual Return to Registry of Societies', description: 'Annual statutory filing due by 31 March 2026.', owner_email: 'sarah.lim@nrcs.sg', due_date: '2026-03-31', status: 'Done', meeting_title: 'Board Meeting – February 2026', notes: 'Filed online via ACRA portal on 28 March 2026.' },
  { title: 'Review and update staff job descriptions', description: 'Annual HR review of all 9 staff position descriptions for currency and accuracy.', owner_email: 'rachel.wong@nrcs.sg', due_date: '2026-03-10', status: 'Done', meeting_title: 'Board Meeting – November 2025', notes: '9 JDs reviewed. 2 updated to reflect expanded service scope.' },
]

type ApprovalData = {
  title: string
  summary: string
  proposal_text: string
  approval_type: 'simple_majority' | 'two_thirds' | 'unanimous' | 'custom'
  voting_deadline: string
  status: 'open' | 'closed' | 'approved' | 'rejected' | 'archived'
  show_individual_votes_to_board: boolean
  votes: { voter_email: string; vote: 'Approve' | 'Disapprove' | 'Abstain' | 'Request Clarification'; reason?: string }[]
  comments: { author_email: string; text: string }[]
  linked_doc_title?: string
}

const APPROVALS_DATA: ApprovalData[] = [
  {
    title: 'Approve Renovation of Bukit Timah Centre ($220,000)',
    summary: 'Approve the renovation of Bukit Timah Centre up to $220,000 inclusive of 10% contingency, and authorise the Finance Committee to execute the BuildRight Pte Ltd contract.',
    proposal_text: `PROPOSAL: APPROVE RENOVATION OF BUKIT TIMAH CENTRE

Background:
The Bukit Timah Centre facilities audit (October 2025) identified structural deficiencies, inadequate disability access, and poor energy efficiency requiring immediate attention.

Proposed Works (3 phases):
Phase 1 — Structural & Safety: $65,000
Phase 2 — Accessibility (DDA-compliant lift, widened doors): $82,000
Phase 3 — Interior fit-out (counselling rooms, reception): $53,000
Contingency (10%): $20,000
Total: $220,000

Contractor: BuildRight Pte Ltd (lowest of 3 quotations at $198,500). Reference checks completed satisfactorily.

Funding: From board-designated Renovation Reserve ($220,000 set aside at March 2026 meeting).

Timeline: Q2–Q4 FY2026. Counselling services temporarily relocated to Queenstown Centre during construction.

RESOLUTION PROPOSED:
"The Board of NRCS resolves to approve the renovation of Bukit Timah Centre at a total budget of S$220,000 inclusive of contingency, and authorises the Finance Committee to execute the contract with BuildRight Pte Ltd."`,
    approval_type: 'simple_majority',
    voting_deadline: '2026-05-10T23:59:59+08:00',
    status: 'open',
    show_individual_votes_to_board: true,
    votes: [
      { voter_email: 'daniel@nrcs.sg', vote: 'Approve', reason: 'Well-planned, adequately budgeted, and critical for service continuity.' },
      { voter_email: 'sarah.lim@nrcs.sg', vote: 'Approve', reason: 'Finance Committee has reviewed all quotations. Recommend approval.' },
      { voter_email: 'michael.chen@nrcs.sg', vote: 'Approve', reason: 'Renovation is necessary. Timeline is realistic.' },
      { voter_email: 'rachel.wong@nrcs.sg', vote: 'Approve' },
      { voter_email: 'james.ong@nrcs.sg', vote: 'Approve', reason: 'Statutory compliance requirements make this a priority.' },
      { voter_email: 'linda.koh@nrcs.sg', vote: 'Abstain', reason: 'Conflict — my husband is a director of one of the other contractors.' },
    ],
    comments: [
      { author_email: 'michael.chen@nrcs.sg', text: 'Should we include a clause in the contract about liquidated damages if BuildRight misses the Q3 completion date? Disruption to counselling services would be significant.' },
      { author_email: 'sarah.lim@nrcs.sg', text: 'Good point Michael. I have included a 1% per week LD clause (capped at 10%) in the draft LOI. Finance Committee is reviewing.' },
      { author_email: 'daniel@nrcs.sg', text: 'Agreed. Also want to confirm that we have a proper variation order process — any scope changes above $5,000 to be approved by Finance Committee before proceeding.' },
    ],
    linked_doc_title: 'Bukit Timah Centre Renovation — Project Brief',
  },
  {
    title: 'Approve FY2026/27 Operating Budget ($1.40M)',
    summary: 'Approve the FY2026/27 operating budget of $1,397,000 including expanded counselling service and Gala 2026 fundraising event costs.',
    proposal_text: `PROPOSAL: APPROVE FY2026/27 OPERATING BUDGET

Total Budget: $1,397,000 (increase of 2.1% vs FY2025/26)

Budget Breakdown:
Staff Costs: $612,000 (43.8%) — includes 0.5 FTE increase for Jurong West expansion
Programme Costs: $498,000 (35.6%)
Gala 2026 Event Costs: $160,000 (11.4%)
Premises & Utilities: $68,000 (4.9%)
Administration & Governance: $59,000 (4.2%)

Revenue Projections:
Government Grants (confirmed): $742,000
Gala 2026 (net target): $400,000
Donations (other): $155,000
Service Fees: $100,000
Total Revenue: $1,397,000

Key assumptions: Jurong West expansion commences October 2026; Gala 2026 achieves net $400,000 target; existing grants renewed at current levels.

Risk: If Jurong West funding not secured, programme costs reduced by $156,000 and corresponding revenue assumptions removed. Budget remains balanced in base case and downside scenario.`,
    approval_type: 'simple_majority',
    voting_deadline: '2026-05-17T23:59:59+08:00',
    status: 'open',
    show_individual_votes_to_board: false,
    votes: [
      { voter_email: 'sarah.lim@nrcs.sg', vote: 'Approve', reason: 'Budget is balanced and reflects realistic assumptions.' },
      { voter_email: 'daniel@nrcs.sg', vote: 'Approve' },
      { voter_email: 'michael.chen@nrcs.sg', vote: 'Approve', reason: 'Programme costs are well-justified.' },
      { voter_email: 'linda.koh@nrcs.sg', vote: 'Approve', reason: 'Gala targets are achievable based on current sponsor pipeline.' },
      { voter_email: 'rachel.wong@nrcs.sg', vote: 'Request Clarification', reason: 'What is the contingency plan if Gala raises less than $300,000?' },
    ],
    comments: [
      { author_email: 'rachel.wong@nrcs.sg', text: 'I have requested clarification on the Gala contingency. If fundraising falls short, which programme costs would be prioritised or deferred?' },
      { author_email: 'sarah.lim@nrcs.sg', text: 'Rachel — if Gala net is below $300K, we would draw down on free reserves (currently $811K). The board has previously agreed reserves above 6 months can be deployed for strategic priorities. A mid-year budget review would be triggered.' },
    ],
    linked_doc_title: 'Q1 FY2026 Financial Report',
  },
  {
    title: 'Approve Counselling Service Expansion to Jurong West',
    summary: 'Approve in-principle the expansion of NRCS counselling services to Jurong West Community Centre from October 2026, subject to grant funding conditions.',
    proposal_text: `PROPOSAL: APPROVE COUNSELLING SERVICE EXPANSION — JURONG WEST

The Board is invited to approve in principle the establishment of a satellite counselling service at Jurong West Community Centre (JWCC), subject to the following conditions precedent:

1. Confirmation of JWCC co-location agreement at $1,200/month
2. Receipt of at least $80,000 annual funding from Community Silver Fund or equivalent
3. Appointment of lead counsellor by 31 August 2026

Service Model: 3 days per week, 2 counsellors per session. Target caseload: 200–250 clients per year by Year 2.

Total Additional Budget: $174,000 Year 1 (incl. $18,000 one-off fit-out); $156,000 p.a. from Year 2.

This conditional approval allows management to proceed with JWCC negotiations and grant applications while managing financial risk. Final confirmation required when conditions are met.`,
    approval_type: 'two_thirds',
    voting_deadline: '2026-05-20T23:59:59+08:00',
    status: 'open',
    show_individual_votes_to_board: true,
    votes: [
      { voter_email: 'michael.chen@nrcs.sg', vote: 'Approve', reason: 'This is a priority for the organisation. Conditional approval is the right approach.' },
      { voter_email: 'daniel@nrcs.sg', vote: 'Approve' },
      { voter_email: 'sarah.lim@nrcs.sg', vote: 'Approve', reason: 'Conditions precedent are appropriate risk management.' },
      { voter_email: 'rachel.wong@nrcs.sg', vote: 'Approve', reason: 'Staff capacity confirmed — HR can support the recruitment.' },
      { voter_email: 'james.ong@nrcs.sg', vote: 'Disapprove', reason: 'Concerned that the 2-month timeline to secure funding before board approval is too optimistic. Prefer to wait for grant confirmation first.' },
    ],
    comments: [
      { author_email: 'james.ong@nrcs.sg', text: 'My concern is that "in principle" approval creates an expectation with JWCC that we will proceed. If the grant falls through, we may face reputational risk in having raised and then withdrawn.' },
      { author_email: 'michael.chen@nrcs.sg', text: 'James, I have spoken to JWCC. They are comfortable with a conditional commitment and understand our funding dependency. They have given us first right of refusal on the space until 30 September 2026.' },
    ],
    linked_doc_title: 'Counselling Service Expansion Proposal',
  },
  {
    title: 'Approve Gala 2026 Campaign Budget ($160,000)',
    summary: 'Approve event production budget of $160,000 for the Gala 2026 "Hearts That Heal" fundraising dinner, targeting net fundraising of $400,000.',
    proposal_text: `PROPOSAL: APPROVE GALA 2026 EVENT BUDGET

The "Hearts That Heal" Gala 2026 is NRCS's flagship annual fundraising event. The Board is invited to approve the event production budget.

Budget: $160,000
Venue and Catering (300 pax, 3-course): $95,000
AV Production and Entertainment: $28,000
Décor and Theming: $12,000
Printing, Invitations, Collateral: $8,000
Charity Auction Production: $7,000
Staffing and Logistics: $10,000
Total: $160,000

Fundraising Targets:
Corporate Sponsorships (Platinum/Gold/Silver): $400,000
Table Sales (20 tables × $3,000): $60,000
Charity Auction: $80,000
Raffle: $20,000
Gross Target: $560,000 | Less Event Costs: $160,000 | Net Target: $400,000

The Gala is central to FY2026/27 budget sustainability. Sponsor pipeline of $280,000 already identified by Linda Koh (Fundraising Chair).

Date: 15 August 2026.`,
    approval_type: 'simple_majority',
    voting_deadline: '2026-04-10T23:59:59+08:00',
    status: 'approved',
    show_individual_votes_to_board: true,
    votes: [
      { voter_email: 'linda.koh@nrcs.sg', vote: 'Approve', reason: 'Sponsor pipeline is strong. Venue costs are competitive.' },
      { voter_email: 'daniel@nrcs.sg', vote: 'Approve' },
      { voter_email: 'sarah.lim@nrcs.sg', vote: 'Approve', reason: 'Budget is proportionate. Net target is realistic.' },
      { voter_email: 'michael.chen@nrcs.sg', vote: 'Approve' },
      { voter_email: 'rachel.wong@nrcs.sg', vote: 'Approve' },
      { voter_email: 'james.ong@nrcs.sg', vote: 'Approve' },
    ],
    comments: [
      { author_email: 'linda.koh@nrcs.sg', text: 'Confirmed: Fullerton Hotel has given us a preliminary hold on 15 August. We need to confirm by 30 April. Recommend the board approve so we can move ahead.' },
    ],
    linked_doc_title: 'Gala 2026 Fundraising Campaign — Campaign Brief',
  },
]

// ─── Main seed function ────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function seedDemoData(adminSupa: any) {
  const log: string[] = []

  // 1. Get admin profile
  const { data: adminProfileRaw } = await adminSupa
    .from('profiles').select('id, email').eq('email', 'daniel@nrcs.sg').single()
  const adminProfile = adminProfileRaw as { id: string; email: string } | null
  if (!adminProfile) throw new Error('Admin profile (daniel@nrcs.sg) not found. Create the admin user first.')
  log.push(`Found admin profile: ${adminProfile.id}`)

  // 2. Create board member users
  const pidMap: Record<string, string> = { 'daniel@nrcs.sg': adminProfile.id }

  for (const bm of BOARD_MEMBERS) {
    const { data: existing } = await adminSupa.from('profiles').select('id').eq('email', bm.email).single()
    if (existing) { pidMap[bm.email] = existing.id; log.push(`Existing user: ${bm.email}`); continue }

    const { data: authUser, error: authErr } = await adminSupa.auth.admin.createUser({
      email: bm.email, password: bm.password, email_confirm: true,
      user_metadata: { full_name: bm.full_name, role: bm.role },
    })
    if (authErr || !authUser?.user) { log.push(`WARN: Could not create ${bm.email}: ${authErr?.message}`); continue }

    // Profile is created by the trigger — poll briefly
    let profile = null
    for (let i = 0; i < 5; i++) {
      await new Promise(r => setTimeout(r, 500))
      const { data } = await adminSupa.from('profiles').select('id').eq('user_id', authUser.user.id).single()
      if (data) { profile = data; break }
    }
    if (profile) {
      // Ensure role is set correctly
      await adminSupa.from('profiles').update({ role: bm.role }).eq('id', profile.id)
      pidMap[bm.email] = profile.id
      log.push(`Created user: ${bm.email} → ${profile.id}`)
    } else {
      log.push(`WARN: Profile not created for ${bm.email}`)
    }
  }

  // 3. Check idempotency — skip if already seeded
  const { count: existingMeetings } = await adminSupa
    .from('meetings').select('id', { count: 'exact', head: true }).eq('title', 'Board Meeting – November 2025')
  if ((existingMeetings ?? 0) > 0) {
    return { log, message: 'Already seeded — skipped duplicate data insertion.' }
  }

  // 4. Seed documents
  const docIdMap: Record<string, string> = {}
  for (const doc of DEMO_DOCUMENTS) {
    const { data: inserted, error } = await adminSupa.from('documents').insert({
      title: doc.title, category: doc.category, description: doc.description,
      file_path: `demo/${doc.title.toLowerCase().replace(/[^a-z0-9]+/g, '_')}.pdf`,
      document_date: doc.document_date,
      extracted_text: doc.extracted_text,
      uploaded_by: adminProfile.id,
      status: 'active',
    }).select('id').single()
    if (error) { log.push(`WARN doc: ${doc.title} — ${error.message}`); continue }
    docIdMap[doc.title] = inserted!.id
    log.push(`Doc: ${doc.title}`)

    // Generate and store chunks + embeddings
    const chunks = chunkText(doc.extracted_text)
    for (let i = 0; i < chunks.length; i++) {
      const embedding = await generateEmbedding(chunks[i])
      await adminSupa.from('document_chunks').insert({
        document_id: inserted!.id, chunk_text: chunks[i], chunk_index: i,
        embedding: JSON.stringify(embedding),
      })
    }
    log.push(`  → ${chunks.length} chunks indexed`)
  }

  // 5. Seed meetings
  const meetingIdMap: Record<string, string> = {}
  for (const m of MEETINGS_DATA) {
    const attendeeIds = m.attendees_names.map(n => {
      const email = Object.keys(pidMap).find(e => pidMap[e] && BOARD_MEMBERS.concat([{ email: 'daniel@nrcs.sg', full_name: 'Daniel Tan', role: 'admin', password: '' }]).find(b => b.full_name === n && b.email === e))
      return email ? pidMap[email] : null
    }).filter(Boolean)

    const absenteeIds = m.absentees_names.map(n => {
      const email = Object.keys(pidMap).find(e => BOARD_MEMBERS.concat([{ email: 'daniel@nrcs.sg', full_name: 'Daniel Tan', role: 'admin', password: '' }]).find(b => b.full_name === n && b.email === e))
      return email ? pidMap[email] : null
    }).filter(Boolean)

    const { data: inserted, error } = await adminSupa.from('meetings').insert({
      title: m.title, meeting_date: m.meeting_date, status: m.status,
      agenda_json: m.agenda_json,
      attendees_json: attendeeIds,
      absentees_json: absenteeIds,
      transcript_text: m.transcript_text ?? null,
      draft_minutes: m.draft_minutes ?? null,
      final_minutes: m.final_minutes ?? null,
      created_by: adminProfile.id,
    }).select('id').single()
    if (error) { log.push(`WARN meeting: ${m.title} — ${error.message}`); continue }
    meetingIdMap[m.title] = inserted!.id
    log.push(`Meeting: ${m.title}`)
  }

  // 6. Seed action items
  let aiCount = 0
  for (const ai of ACTION_ITEMS_DATA) {
    const ownerId = pidMap[ai.owner_email]
    if (!ownerId) { log.push(`WARN action: no profile for ${ai.owner_email}`); continue }
    const meetingId = ai.meeting_title ? meetingIdMap[ai.meeting_title] : null
    const { error } = await adminSupa.from('action_items').insert({
      title: ai.title, description: ai.description ?? null,
      owner_user_id: ownerId,
      due_date: ai.due_date, status: ai.status,
      notes: ai.notes ?? null,
      meeting_id: meetingId ?? null,
    })
    if (error) log.push(`WARN action item: ${ai.title} — ${error.message}`)
    else aiCount++
  }
  log.push(`Action items: ${aiCount}`)

  // 7. Seed approvals + votes + comments
  for (const ap of APPROVALS_DATA) {
    const linkedDocId = ap.linked_doc_title ? docIdMap[ap.linked_doc_title] : null
    const { data: inserted, error: apErr } = await adminSupa.from('approval_items').insert({
      title: ap.title, summary: ap.summary, proposal_text: ap.proposal_text,
      approval_type: ap.approval_type,
      voting_deadline: ap.voting_deadline,
      status: ap.status,
      show_individual_votes_to_board: ap.show_individual_votes_to_board,
      linked_documents_json: linkedDocId ? [linkedDocId] : [],
      created_by: adminProfile.id,
      closed_at: ap.status === 'approved' ? ap.voting_deadline : null,
    }).select('id').single()
    if (apErr || !inserted) { log.push(`WARN approval: ${ap.title} — ${apErr?.message}`); continue }
    log.push(`Approval: ${ap.title}`)

    for (const v of ap.votes) {
      const voterId = pidMap[v.voter_email]
      if (!voterId) continue
      await adminSupa.from('approval_votes').insert({
        approval_item_id: inserted.id, voter_user_id: voterId,
        vote: v.vote, reason: v.reason ?? null,
      })
    }

    for (const c of ap.comments) {
      const userId = pidMap[c.author_email]
      if (!userId) continue
      await adminSupa.from('approval_comments').insert({
        approval_item_id: inserted.id, user_id: userId, comment_text: c.text,
      })
    }
  }

  return { log, message: `Seeded: ${Object.keys(pidMap).length} users, ${Object.keys(docIdMap).length} documents, ${Object.keys(meetingIdMap).length} meetings, ${aiCount} action items, ${APPROVALS_DATA.length} approvals.` }
}

// ─── Route handler ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('user_id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const adminSupa = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await seedDemoData(adminSupa as any)
    return NextResponse.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Seed failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
