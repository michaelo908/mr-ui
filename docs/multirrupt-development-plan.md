# Multirrupt development plan

## Product discipline

Multirrupt is an independent reader-side editorial intelligence layer. Its job is to examine completed or substantially complete communication from the receiving reader's perspective, identify what is genuinely working and where the material creates avoidable friction, then offer grounded rewrites.

It is not a generic conversational copy assistant. It should not accumulate detailed user instructions until its editorial judgment is replaced by a constrained prompt. Light intent is useful: for example, email to a warm list, proposal, tender response, article, chapter, or social post.

Strength and risk are independent signals. Good work is explicitly recognised and protected; it does not cancel reader-loss risks elsewhere in the material.

## Standard paid editor

The Standard editor remains the priority commercial product. It should make a serious single piece of writing more coherent, credible and usable without becoming a broad content-production suite.

Current large-input limits should be communicated truthfully:

- pasted text and URLs: 30,000 characters;
- uploaded Word and PDF documents: 60,000 characters;
- document uploads are best described as a chapter, section, long article, report section or proposal part, not a whole book.

Before changing the pasted-text limit, test whether 60,000 characters remains reliable end-to-end. Do not promise whole-manuscript analysis merely by raising an input ceiling.

## Standard Long Form Review Passes

Add a deliberately bounded review-pass workflow before building Multirrupt Pro.

### Purpose

Long Form Review Passes allow users to examine a body of substantial, connected work without treating a book, report, proposal or guide library as one enormous prompt.

This is not a permanent, evolving document-management system. It is a coherent editorial diagnosis of one selected draft state. The value is practical orchestration of work Multirrupt already does well: analyse the parts carefully, then understand what those parts are doing together.

Suitable work includes:

- book chapters;
- proposals and submissions;
- tender responses;
- reports and policy documents;
- training or course material;
- a growing body of articles on a shared subject.

### Minimum useful workflow

1. Create a named Review Pass with a work type, intended reader and central purpose.
2. Upload all selected sections or documents from the same draft state.
3. Analyse those sections sequentially, retaining each source, analysis, evidence and optional rewrite under its section title for the duration of the pass.
4. Carry the concise work frame into every section analysis.
5. Generate a dated **Whole Work Review** from the concurrent section reports, not from one oversized raw-text request.

The Whole Work Review should identify reader trajectory, recurring strengths to protect, repeated friction, pacing or structure problems, contradictions, gaps, drift in audience assumptions, and a short ranked list of consequential recommendations.

It should not initially attempt to rewrite an entire book or project at once. Rewrites remain section- or passage-level, grounded in the relevant analysis.

### Boundary: revisions do not update the pass

Once the writer begins revising, the Review Pass remains a record of what Multirrupt found in the selected source draft. It is not silently refreshed, version-tracked, or treated as an assessment of later rewritten material.

This avoids a misleading and burdensome loop in which every rewrite invalidates an earlier diagnosis and users are prompted to keep reanalysing minor changes. Multirrupt's job is to identify the consequential decisions in an initial editorial pass; the writer then applies them with judgement.

If a materially new draft warrants another whole-work assessment, the user creates a new, distinct Review Pass, for example `Book Draft Initial Review` and `Book Draft Post Developmental Edit Review`.

### Output and retention

Multirrupt is a passing-through editorial review stage, not the canonical home of the client's work. A completed Review Pass should export a tidy review package containing named section analyses, selected rewrites and the Whole Work Review. The client saves or extracts that package into their own chosen working folder and continues revising in their normal writing system.

Avoid a permanent Standard customer-content database merely to emulate a project workspace. The system may use temporary, expiring job storage to make a large queued pass reliable and resumable, but it should not imply that it retains an always-current manuscript or becomes the source of truth.

For broad browser compatibility, the standard delivery should be a downloaded review-package ZIP. A direct "save into this folder" action can be an optional convenience in browsers that explicitly support directory access, never a required part of the workflow.

### Example structure

```text
Mekong River Leadership Program Initial Review
  Review brief
  01 Capacity and Training Experience
    Analysis
    Rewrites
  02 Response to Course Specification
    Analysis
    Rewrites
  03 Key Personnel
  04 Value for Money and Innovation
  05 Training and Coaching Plan
  Whole Tender Review dated 2026 09 30
```

## Tender response review passes

Tender is a distinct work type, not simply another name for a proposal. Tender readers assess a response against stated criteria, mandatory conditions, procurement risk, value for money and separate but connected sections.

### Evaluator frame

Tender review passes should accept source material in two groups:

```text
Evaluator material
  Request for Tender / Terms of Reference
  Evaluation criteria and weightings
  Scope, deliverables and timetable
  Mandatory conditions and response schedule

Our response
  Capacity and relevant experience
  Technical approach
  Personnel
  Implementation plan
  Value for money
  Annexes
```

Evaluator material is reference context, not content to rewrite. It provides the criteria against which the response is examined.

### What Multirrupt does

For each response section, Multirrupt should assess:

- whether it answers the applicable criterion directly;
- whether its evidence is proportionate to its claim;
- whether an evaluator can locate the answer quickly;
- whether general capability is distinguished from relevant capability;
- whether delivery, implementation, risk and value-for-money claims form a coherent case;
- whether the section asks the evaluator to perform unnecessary integration work.

The Whole Tender Review can provide a criterion-level view of evidence located, reader confidence and principal gaps. Its role is to make a completed response clearer, more defensible and more scoreable.

### Explicit product boundary

Multirrupt does **not** seek to become an enterprise RFP/bid-management platform. It will not initially build:

- tender discovery or bid chasing;
- CRM integrations;
- assignment and approval workflows for subject-matter experts;
- a broad approved-answer library;
- procurement workflow, bid/no-bid operations or final document production;
- replacement collaboration infrastructure for products such as Loopio, Responsive, QorusDocs or AutogenAI.

Those systems help large organisations collect, populate, coordinate and submit tenders. Multirrupt works at the complementary final editorial stage: once the response is substantially complete, it asks what the assessor will actually receive.

## Pro direction

Pro can later extend review-pass history into a persistent, searchable editorial knowledge base: automatic folder/chapter ingestion, segmentation, deep cross-work analysis, tags, sources, recurring themes and claims, version history, collaboration, repurposing, Signals and a long-form Graviton that plans and manages the sequence.

Standard Review Passes must remain useful without these features. Their first value is straightforward batch organisation, section-grounded analysis and a one-time whole-work synthesis.
