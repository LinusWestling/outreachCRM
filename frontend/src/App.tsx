import { Fragment, forwardRef, useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from "react";

type CreatorChannel = 1 | 2;
type PlatformFilter = "all" | "Instagram" | "TikTok";
type ProspectReadinessFilter = "queued" | "ready";
type CreatorResponseStatus = "Yes" | "No" | "Not Interested" | "Archived";
type ResponseFilter = "all" | CreatorResponseStatus;
type EmailFilter = "all" | "has" | "missing";
type ViewName = "reachedOut" | "prospecting" | "todo" | "templates" | "creatorCodes";
type TemplateKind = "Dm" | "Email";
type ReachedOutSortField = "followers" | "firstDate" | "lastDate" | "notInterested";
type SortDirection = "asc" | "desc";
type LiveStatus = "connecting" | "live" | "syncing" | "offline";
type CreatorStage = "Ongoing" | "Active" | "Converted" | "No redemptions";
type CreatorCodeStatus = "active" | "disabled" | "expired";

type CreatorRow = {
  id: string;
  profileUrl: string;
  handle?: string | null;
  channel: CreatorChannel;
  followers?: number | null;
  messageVersion?: string | null;
  firstMessageDate?: string | null;
  responseStatus: CreatorResponseStatus;
  responded?: boolean | null;
  email?: string | null;
  threadsUrl?: string | null;
  secondMessageDate?: string | null;
  lastContactDate?: string | null;
  code?: string | null;
  resumeContact?: boolean | null;
  messageTemplateId?: string | null;
  messageBody?: string | null;
  emailTemplateId?: string | null;
  emailSubject?: string | null;
  emailBody?: string | null;
  emailTemplateName?: string | null;
  emailMessageVersion?: string | null;
  emailMessageSubject?: string | null;
  emailMessageBody?: string | null;
  isReadyForAction?: boolean;
  prospectReadyAt?: string | null;
  ongoingCount?: number | null;
  activatedCount?: number | null;
  convertedCount?: number | null;
  paidEligibleCount?: number | null;
  firstRedeemedAt?: string | null;
  lastRedeemedAt?: string | null;
  currentStage?: CreatorStage | null;
};

type MessageTemplate = {
  id: string;
  Id?: string | null;
  name: string;
  Name?: string | null;
  platform?: string | null;
  Platform?: string | null;
  kind?: TemplateKind | string | null;
  Kind?: TemplateKind | string | null;
  type?: TemplateKind | string | null;
  Type?: TemplateKind | string | null;
  purpose?: string | null;
  Purpose?: string | null;
  category?: string | null;
  Category?: string | null;
  subject?: string | null;
  Subject?: string | null;
  body: string;
  Body?: string | null;
  generationRules?: string | null;
  GenerationRules?: string | null;
  isActive: boolean;
  IsActive?: boolean | null;
  createdAt: string;
  CreatedAt?: string | null;
  updatedAt: string;
  UpdatedAt?: string | null;
};

type PagedCreators = {
  items: CreatorRow[];
  pageNumber: number;
  pageSize: number;
  totalCount: number;
};

type DailyOutreachCounts = {
  date: string;
  instagram: number;
  tikTok: number;
};

type DailyOutreachCountsResponse = Partial<DailyOutreachCounts> & {
  Date?: string;
  Instagram?: number;
  TikTok?: number;
  tiktok?: number;
};

type CreatorStats = {
  totalCount: number;
  respondedCount: number;
  notInterestedCount: number;
  archivedCount: number;
  emailCount: number;
  threadsCount: number;
};

type CreatorConversionSummary = {
  reachedOutCount: number;
  respondedCreatorCount: number;
  ongoingCreatorCount: number;
  activatedCreatorCount: number;
  convertedCreatorCount: number;
  replyToRedeemRate: number;
  redeemToTrialRate: number;
  trialToPaidRate: number;
};

type CreatorCode = {
  id: string;
  code: string;
  creatorId: string;
  creatorDisplayName: string;
  status: CreatorCodeStatus;
  validFrom?: string | null;
  validUntil?: string | null;
  premiumDurationDays?: number | null;
  createdAt: string;
  updatedAt: string;
  ongoingCount: number;
  activatedCount: number;
  convertedCount: number;
  paidEligibleCount: number;
  firstRedeemedAt?: string | null;
  lastRedeemedAt?: string | null;
  currentStage: CreatorStage;
};

type ProspectDuplicateCheck = {
  profileUrl: string;
  handle: string;
  channel: CreatorChannel;
  isDuplicate: boolean;
  duplicateType?: "prospect" | "reached-out" | null;
  message?: string | null;
};

type CreatorFilters = {
  query: string;
  platform: PlatformFilter;
  responseStatus: ResponseFilter;
  emailPresence: EmailFilter;
  messageVersion: string;
  code: string;
  firstDate: string;
  lastDate: string;
  sortField: ReachedOutSortField;
  sortDirection: SortDirection;
};

type TodoFilters = {
  query: string;
  daysWithoutContact: string;
  includeResponded: boolean;
  includeHasEmail: boolean;
  contactabilityMode: "any" | "all";
  includeNeverContacted: boolean;
};

type ProspectForm = {
  profileUrl: string;
  followers: string;
  email: string;
  threadsUrl: string;
  firstMessageDate: string;
};

type TemplateForm = {
  id: string | null;
  kind: TemplateKind;
  name: string;
  subject: string;
  body: string;
  generationRules: string;
  activate: boolean;
};

type TemplateForms = Record<TemplateKind, TemplateForm>;

type BulkEditForm = {
  setFirstMessageDate: boolean;
  firstMessageDate: string;
  setLastContactDate: boolean;
  lastContactDate: string;
  setResponseStatus: boolean;
  responseStatus: CreatorResponseStatus;
  setMessage: boolean;
  messageTemplateId: string;
};

type CreatorCodeForm = {
  code: string;
  creatorId: string;
  premiumDurationDays: string;
  validFrom: string;
  validUntil: string;
  status: CreatorCodeStatus;
};

type CreatorCodePatch = {
  status?: CreatorCodeStatus;
  validUntil?: string | null;
  clearValidUntil?: boolean;
  premiumDurationDays?: number | null;
  creatorDisplayName?: string | null;
};

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:5168";
const LEGACY_DEFAULT_MESSAGE_BODY = "Personalize this outreach message for the creator before sending.";
const MAX_EMAIL_SEND_BATCH_SIZE = 10;

const emptyFilters: CreatorFilters = {
  query: "",
  platform: "all",
  responseStatus: "all",
  emailPresence: "all",
  messageVersion: "",
  code: "",
  firstDate: "",
  lastDate: "",
  sortField: "lastDate",
  sortDirection: "desc",
};

const defaultTodoFilters: TodoFilters = {
  query: "",
  daysWithoutContact: "7",
  includeResponded: false,
  includeHasEmail: false,
  contactabilityMode: "any",
  includeNeverContacted: false,
};

const emptyCreatorStats: CreatorStats = {
  totalCount: 0,
  respondedCount: 0,
  notInterestedCount: 0,
  archivedCount: 0,
  emailCount: 0,
  threadsCount: 0,
};

const emptyCreatorConversionSummary: CreatorConversionSummary = {
  reachedOutCount: 0,
  respondedCreatorCount: 0,
  ongoingCreatorCount: 0,
  activatedCreatorCount: 0,
  convertedCreatorCount: 0,
  replyToRedeemRate: 0,
  redeemToTrialRate: 0,
  trialToPaidRate: 0,
};

const TEMPLATE_KINDS: TemplateKind[] = ["Dm", "Email"];

const emptyTemplateForm = (kind: TemplateKind): TemplateForm => ({
  id: null,
  kind,
  name: "",
  subject: "",
  body: "",
  generationRules: "",
  activate: true,
});

const emptyTemplateForms = (): TemplateForms => ({
  Dm: emptyTemplateForm("Dm"),
  Email: emptyTemplateForm("Email"),
});

const defaultBulkEditForm = (): BulkEditForm => ({
  setFirstMessageDate: false,
  firstMessageDate: today(),
  setLastContactDate: false,
  lastContactDate: today(),
  setResponseStatus: false,
  responseStatus: "No",
  setMessage: false,
  messageTemplateId: "",
});

const defaultCreatorCodeForm = (): CreatorCodeForm => ({
  code: "",
  creatorId: "",
  premiumDurationDays: "21",
  validFrom: "",
  validUntil: "",
  status: "active",
});

const channelName = (channel: CreatorChannel) => (channel === 2 ? "TikTok" : "Instagram");

const prospectPipelinePrompt = (filter: PlatformFilter) => {
  if (filter === "Instagram") {
    return "Start the outreach prospect pipeline for the Instagram accounts that are queued. Use low effort sub agents. If profile data is missing or URL crawls are blocked/incomplete, dispatch one final Missing Data Collector Agent for those profiles, then dispatch one Message Review Agent to review the personalized messages for those profiles. After verification passes, dispatch the Readiness QA Agent to mark prospects ready for action only when follower count is set and the saved message is personalized from the default template. Do 20 of the profiles. If you do not get follower counts, continue using the Codex browser yourself, sub agents can not access the Codex in-app browser. You will then delegate personalization and profiles updates to sub agents which you provide with information.";
  }

  if (filter === "TikTok") {
    return "Start the outreach prospect pipeline for the tiktok accounts that are queued. Use low effort sub agents. If profile data is missing or URL crawls are blocked/incomplete, dispatch one final Missing Data Collector Agent for those profiles, then dispatch one Message Review Agent to review the personalized messages for those profiles. After verification passes, dispatch the Readiness QA Agent to mark prospects ready for action only when follower count is set and the saved message is personalized from the default template. Do 15 of the profiles. If you do not get follower counts, continue using the Codex browser yourself, sub agents can not access the Codex in-app browser. You will then delegate personalization and profiles updates to sub agents which you provide with information.";
  }

  return "Start the outreach prospect pipeline for the TikTok and Instagram accounts that are queued. Use low effort sub agents. If profile data is missing or URL crawls are blocked/incomplete, dispatch one final Missing Data Collector Agent for those profiles, then dispatch one Message Review Agent to review the personalized messages for those profiles. After verification passes, dispatch the Readiness QA Agent to mark prospects ready for action only when follower count is set and the saved message is personalized from the default template.";
};

const liveStatusLabel = (status: LiveStatus) => {
  switch (status) {
    case "connecting":
      return "Connecting";
    case "syncing":
      return "Syncing";
    case "offline":
      return "Offline";
    default:
      return "Live";
  }
};

function App() {
  const [view, setView] = useState<ViewName>("reachedOut");
  const [creators, setCreators] = useState<CreatorRow[]>([]);
  const [pending, setPending] = useState<CreatorRow[]>([]);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [liveStatus, setLiveStatus] = useState<LiveStatus>("connecting");
  const [creatorStats, setCreatorStats] = useState<CreatorStats>(emptyCreatorStats);
  const [creatorConversionSummary, setCreatorConversionSummary] = useState<CreatorConversionSummary>(emptyCreatorConversionSummary);
  const [creatorCodes, setCreatorCodes] = useState<CreatorCode[]>([]);
  const [includeInactiveCodes, setIncludeInactiveCodes] = useState(false);
  const [dailyOutreachCounts, setDailyOutreachCounts] = useState<DailyOutreachCounts>({
    date: today(),
    instagram: 0,
    tikTok: 0,
  });
  const [filters, setFilters] = useState<CreatorFilters>(emptyFilters);
  const [pendingPlatformFilter, setPendingPlatformFilter] = useState<PlatformFilter>("all");
  const [pendingReadinessFilter, setPendingReadinessFilter] = useState<ProspectReadinessFilter>("queued");
  const [todoFilters, setTodoFilters] = useState<TodoFilters>(defaultTodoFilters);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [selectedCreatorId, setSelectedCreatorId] = useState<string | null>(null);
  const [expandedTodoCreatorIds, setExpandedTodoCreatorIds] = useState<Set<string>>(() => new Set());
  const [markedCreatorIds, setMarkedCreatorIds] = useState<Set<string>>(() => new Set());
  const [bulkEdit, setBulkEdit] = useState<BulkEditForm>(() => defaultBulkEditForm());
  const [pendingForm, setPendingForm] = useState<ProspectForm>({
    profileUrl: "",
    followers: "",
    email: "",
    threadsUrl: "",
    firstMessageDate: today(),
  });
  const [prospectDuplicateCheck, setProspectDuplicateCheck] = useState<ProspectDuplicateCheck | null>(null);
  const [prospectUrlError, setProspectUrlError] = useState<string | null>(null);
  const [prospectUrlChecking, setProspectUrlChecking] = useState(false);
  const [templateForms, setTemplateForms] = useState<TemplateForms>(() => emptyTemplateForms());
  const [creatorCodeForm, setCreatorCodeForm] = useState<CreatorCodeForm>(() => defaultCreatorCodeForm());
  const editPanelRef = useRef<HTMLElement | null>(null);
  const includeInactiveCodesRef = useRef(includeInactiveCodes);

  useEffect(() => {
    void refreshAll();
  }, []);

  useEffect(() => {
    let closed = false;
    const events = new EventSource(`${API_BASE}/api/events`);

    const markLive = () => {
      if (!closed) setLiveStatus("live");
    };

    const syncCreators = () => {
      if (closed) return;
      setLiveStatus("syncing");
      void Promise.all([loadCreators(), loadPending(), loadDailyOutreachCounts(), loadCreatorStats()])
        .then(() => {
          if (!closed) setLiveStatus("live");
        })
        .catch((error) => {
          if (closed) return;
          setLiveStatus("offline");
          setMessage(error instanceof Error ? error.message : "Live creator sync failed");
        });
    };

    const syncTemplates = () => {
      if (closed) return;
      setLiveStatus("syncing");
      void loadTemplates()
        .then(() => {
          if (!closed) setLiveStatus("live");
        })
        .catch((error) => {
          if (closed) return;
          setLiveStatus("offline");
          setMessage(error instanceof Error ? error.message : "Live template sync failed");
        });
    };

    const syncCreatorCodes = () => {
      if (closed) return;
      setLiveStatus("syncing");
      void Promise.all([loadCreatorCodes(), loadCreators()])
        .then(() => {
          if (!closed) setLiveStatus("live");
        })
        .catch((error) => {
          if (closed) return;
          setLiveStatus("offline");
          setMessage(error instanceof Error ? error.message : "Live creator-code sync failed");
        });
    };

    events.onopen = markLive;
    events.onerror = () => {
      if (!closed) setLiveStatus("offline");
    };
    events.addEventListener("system", markLive);
    events.addEventListener("creators-changed", syncCreators);
    events.addEventListener("templates-changed", syncTemplates);
    events.addEventListener("creator-codes-changed", syncCreatorCodes);

    return () => {
      closed = true;
      events.close();
    };
  }, []);

  useEffect(() => {
    includeInactiveCodesRef.current = includeInactiveCodes;
    if (view === "creatorCodes") {
      void loadCreatorCodes().catch((error) => {
        setMessage(error instanceof Error ? error.message : "Could not load creator codes");
      });
    }
  }, [view, includeInactiveCodes]);

  useEffect(() => {
    if (selectedCreatorId) {
      editPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [selectedCreatorId]);

  useEffect(() => {
    void loadCreators();
  }, [filters.responseStatus]);

  useEffect(() => {
    const profileUrl = pendingForm.profileUrl.trim();
    setProspectDuplicateCheck(null);
    setProspectUrlError(null);

    if (!profileUrl) {
      setProspectUrlChecking(false);
      return;
    }

    const controller = new AbortController();
    setProspectUrlChecking(true);
    const timeout = window.setTimeout(() => {
      const params = new URLSearchParams({ profileUrl });
      void api<ProspectDuplicateCheck>(`/api/creators/pending/duplicate-check?${params}`, { signal: controller.signal })
        .then((check) => {
          setProspectDuplicateCheck(check);
          setProspectUrlError(null);
        })
        .catch((error) => {
          if (controller.signal.aborted) return;
          setProspectUrlError(error instanceof Error ? error.message : "Could not check profile URL");
        })
        .finally(() => {
          if (!controller.signal.aborted) setProspectUrlChecking(false);
        });
    }, 250);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [pendingForm.profileUrl]);

  const dmTemplates = useMemo(() => templates.filter((template) => templateKind(template) === "Dm"), [templates]);
  const emailTemplates = useMemo(() => templates.filter((template) => templateKind(template) === "Email"), [templates]);
  const activeDmTemplate = dmTemplates.find((template) => template.isActive) ?? null;
  const activeEmailTemplate = emailTemplates.find((template) => template.isActive) ?? null;
  const selectedCreator = useMemo(
    () => applyActiveEmailTemplateDefaults(creators.find((creator) => creator.id === selectedCreatorId) ?? null, activeEmailTemplate),
    [activeEmailTemplate, creators, selectedCreatorId],
  );

  const filteredCreators = useMemo(() => {
    const filtered = creators.filter((creator) => creatorMatchesFilters(creator, filters));
    return sortReachedOutCreators(filtered, filters.sortField, filters.sortDirection);
  }, [creators, filters]);

  const todoCreators = useMemo(() => {
    return creators
      .filter((creator) => creatorMatchesTodoFilters(creator, todoFilters))
      .sort((a, b) => contactAgeDays(b) - contactAgeDays(a));
  }, [creators, todoFilters]);

  const filteredPending = useMemo(() => {
    return pending.filter((creator) =>
      creatorMatchesPlatformFilter(creator, pendingPlatformFilter) &&
      creatorMatchesReadinessFilter(creator, pendingReadinessFilter));
  }, [pending, pendingPlatformFilter, pendingReadinessFilter]);
  const pendingSummaryText = `${filteredPending.length} of ${pending.length} ${pendingReadinessFilter} prospects shown.`;
  const pipelinePrompt = prospectPipelinePrompt(pendingPlatformFilter);

  const visibleBulkCreators = useMemo(
    () => view === "todo" ? todoCreators : view === "reachedOut" ? filteredCreators : [],
    [filteredCreators, todoCreators, view],
  );
  const visibleBulkCreatorIds = useMemo(() => new Set(visibleBulkCreators.map((creator) => creator.id)), [visibleBulkCreators]);

  useEffect(() => {
    setMarkedCreatorIds((current) => {
      const next = new Set([...current].filter((id) => visibleBulkCreatorIds.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [visibleBulkCreatorIds]);

  // Code assignment is one-directional: codes live in the Creator Codes tab and are looked up
  // here read-only by matching the creator's GUID Id to creator_codes.creator_id.
  const codeByCreatorId = useMemo(() => {
    const map = new Map<string, string>();
    for (const code of creatorCodes) {
      if (code.creatorId) {
        map.set(code.creatorId.toLowerCase(), code.code);
      }
    }
    return map;
  }, [creatorCodes]);

  const stats = useMemo(() => {
    const archivedCount = creatorStats.archivedCount ?? 0;
    const notInterestedAndArchivedCount = creatorStats.notInterestedCount + archivedCount;
    const creatorCodeSummary = summarizeCreatorCodes(creatorCodes);
    const statItems = {
      reachedOut: { label: "Reached out", value: creatorStats.totalCount.toString(), detail: `${filteredCreators.length} active matching` },
      instagramColdOutreach: { label: "Instagram cold outreach", value: dailyOutreachCounts.instagram.toString(), detail: `First date ${dailyOutreachCounts.date}` },
      tiktokColdOutreach: { label: "TikTok cold outreach", value: dailyOutreachCounts.tikTok.toString(), detail: `First date ${dailyOutreachCounts.date}` },
      prospects: { label: "Prospects", value: pending.length.toString(), detail: "Awaiting personalized send" },
      responses: { label: "Responses", value: creatorStats.respondedCount.toString(), detail: `${rate(creatorStats.respondedCount, creatorStats.totalCount)} response rate` },
      emails: { label: "Emails", value: creatorStats.emailCount.toString(), detail: "Known contacts" },
      threads: { label: "Threads", value: creatorStats.threadsCount.toString(), detail: "Secondary links" },
      notInterestedArchived: { label: "Not interested + archived", value: notInterestedAndArchivedCount.toString(), detail: `${creatorStats.notInterestedCount} not interested, ${archivedCount} archived` },
      totalCreatorCodes: { label: "Total creator codes", value: creatorCodes.length.toString(), detail: `${creatorCodeSummary.activeCount} active` },
      dmTemplates: { label: "DM templates", value: dmTemplates.length.toString(), detail: activeDmTemplate ? `${activeDmTemplate.name} active` : "No active DM" },
      emailTemplates: { label: "Email templates", value: emailTemplates.length.toString(), detail: activeEmailTemplate ? `${activeEmailTemplate.name} active` : "No active email" },
      ongoing: { label: "Ongoing", value: creatorConversionSummary.ongoingCreatorCount.toString(), detail: "Creators with redemptions" },
      active: { label: "Active", value: creatorConversionSummary.activatedCreatorCount.toString(), detail: "Started store trial" },
      converted: { label: "Converted", value: creatorConversionSummary.convertedCreatorCount.toString(), detail: "First paid renewal" },
      replyToRedeem: { label: "Reply→redeem", value: formatPercentValue(creatorConversionSummary.replyToRedeemRate), detail: "Responded creators to redeemed" },
    };

    const statsByView: Record<ViewName, Array<keyof typeof statItems>> = {
      reachedOut: ["reachedOut", "instagramColdOutreach", "tiktokColdOutreach", "responses", "emails", "threads", "notInterestedArchived"],
      prospecting: ["instagramColdOutreach", "tiktokColdOutreach", "prospects"],
      todo: ["reachedOut", "instagramColdOutreach", "tiktokColdOutreach", "responses"],
      templates: ["dmTemplates", "emailTemplates", "prospects", "emails"],
      creatorCodes: ["totalCreatorCodes", "ongoing", "active", "converted", "replyToRedeem"],
    };

    return statsByView[view].map((key) => statItems[key]);
  }, [activeDmTemplate, activeEmailTemplate, creatorCodes, creatorConversionSummary, creatorStats, dailyOutreachCounts, dmTemplates.length, emailTemplates.length, filteredCreators.length, pending.length, view]);

  const hasActiveFilters = JSON.stringify(filters) !== JSON.stringify(emptyFilters);
  const hasActiveTodoFilters = JSON.stringify(todoFilters) !== JSON.stringify(defaultTodoFilters);
  const prospectDuplicateMessage = prospectDuplicateCheck?.isDuplicate
    ? prospectDuplicateCheck.message ?? (prospectDuplicateCheck.duplicateType === "prospect" ? "Already in prospects." : "Already reached out.")
    : null;

  async function refreshAll() {
    setLoading(true);
    setMessage(null);
    try {
      await Promise.all([loadCreators(), loadPending(), loadTemplates(), loadDailyOutreachCounts(), loadCreatorStats()]);
      if (view === "creatorCodes") {
        await loadCreatorCodes();
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load dashboard data");
    } finally {
      setLoading(false);
    }
  }

  async function loadCreators() {
    const params = new URLSearchParams({ PageSize: "500", SortBy: "LastContactDate", SortDescending: "true" });
    if (filters.responseStatus === "Archived") {
      params.set("ResponseStatus", "Archived");
    }

    const [data, summary] = await Promise.all([
      api<PagedCreators>(`/api/creators?${params}`),
      api<CreatorConversionSummary>(`/api/creators/conversion-summary?_=${Date.now()}`),
    ]);
    setCreators((data.items ?? []).map(normalizeCreatorRow));
    setCreatorConversionSummary(summary);
  }

  async function loadCreatorCodes() {
    const params = new URLSearchParams({
      includeInactive: includeInactiveCodesRef.current ? "true" : "false",
      _: Date.now().toString(),
    });
    setCreatorCodes(await api<CreatorCode[]>(`/api/creator-codes?${params}`));
  }

  async function loadPending() {
    setPending((await api<CreatorRow[]>("/api/creators/pending")).map(normalizeCreatorRow));
  }

  async function loadDailyOutreachCounts() {
    const requestedDate = today();
    const params = new URLSearchParams({ date: requestedDate, _: Date.now().toString() });
    const data = await api<DailyOutreachCountsResponse>(`/api/creators/daily-outreach-counts?${params}`);
    setDailyOutreachCounts(normalizeDailyOutreachCounts(data, requestedDate));
  }

  async function loadCreatorStats() {
    setCreatorStats(await api<CreatorStats>(`/api/creators/stats?_=${Date.now()}`));
  }

  async function loadTemplates() {
    const loadedTemplates = sortTemplates(
      (await api<MessageTemplate[]>("/api/templates")).map((template) => normalizeTemplate(template)),
    );
    setTemplates(loadedTemplates);
    return loadedTemplates;
  }

  function updateFilter<Key extends keyof CreatorFilters>(key: Key, value: CreatorFilters[Key]) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  async function createCreatorCode(event: FormEvent) {
    event.preventDefault();

    if (!creatorCodeForm.code.trim()) {
      setMessage("Enter the creator code to create.");
      return;
    }

    if (!creatorCodeForm.creatorId) {
      setMessage("Choose the creator this code belongs to.");
      return;
    }

    const premiumDurationDays = toNullableNumber(creatorCodeForm.premiumDurationDays);
    if (!premiumDurationDays || premiumDurationDays <= 0) {
      setMessage("Premium granted must be at least 1 day.");
      return;
    }

    setLoading(true);
    setMessage(null);
    try {
      const created = await api<CreatorCode>("/api/creator-codes", {
        method: "POST",
        body: JSON.stringify({
          code: creatorCodeForm.code.trim().toUpperCase(),
          creatorId: creatorCodeForm.creatorId,
          premiumDurationDays,
          validFrom: dateInputToUtcIso(creatorCodeForm.validFrom),
          validUntil: dateInputToUtcIso(creatorCodeForm.validUntil),
          status: creatorCodeForm.status,
        }),
      });
      setCreatorCodeForm(defaultCreatorCodeForm());
      await Promise.all([loadCreatorCodes(), loadCreators()]);
      setMessage(`Created code ${created.code}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create creator code");
    } finally {
      setLoading(false);
    }
  }

  async function updateCreatorCode(code: CreatorCode, patch: CreatorCodePatch) {
    setLoading(true);
    setMessage(null);
    try {
      const updated = await api<CreatorCode>(`/api/creator-codes/${code.id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      setCreatorCodes((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      await loadCreators();
      setMessage(`Updated code ${updated.code}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update creator code");
    } finally {
      setLoading(false);
    }
  }

  async function deleteCreatorCode(code: CreatorCode) {
    if (code.ongoingCount > 0) {
      setMessage("Redeemed codes cannot be deleted. Disable the code instead.");
      return;
    }

    if (!window.confirm(`Permanently delete ${code.code}? This removes the code row and cannot be undone.`)) {
      return;
    }

    setLoading(true);
    setMessage(null);
    try {
      await api<void>(`/api/creator-codes/${code.id}`, { method: "DELETE" });
      setCreatorCodes((current) => current.filter((item) => item.id !== code.id));
      await loadCreators();
      setMessage(`Deleted code ${code.code}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not delete creator code");
    } finally {
      setLoading(false);
    }
  }

  async function addPendingCreator(event: FormEvent) {
    event.preventDefault();
    if (prospectDuplicateMessage) {
      setMessage(prospectDuplicateMessage);
      return;
    }

    setLoading(true);
    setMessage(null);
    try {
      const created = await api<CreatorRow>("/api/creators/pending", {
        method: "POST",
        body: JSON.stringify({
          profileUrl: pendingForm.profileUrl,
          followers: toNullableNumber(pendingForm.followers),
          email: emptyToNull(pendingForm.email),
          threadsUrl: emptyToNull(pendingForm.threadsUrl),
          firstMessageDate: pendingForm.firstMessageDate || today(),
        }),
      });
      const normalizedCreated = normalizeCreatorRow(created);
      setPending((current) => [normalizedCreated, ...current]);
      setPendingForm({ profileUrl: "", followers: "", email: "", threadsUrl: "", firstMessageDate: today() });
      setProspectDuplicateCheck(null);
      setProspectUrlError(null);
      setMessage(`Added ${normalizedCreated.handle ?? "creator"} to prospects with ${normalizedCreated.messageVersion ?? "the active template"}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not add prospect");
    } finally {
      setLoading(false);
    }
  }

  async function deletePending(creator: CreatorRow) {
    const label = creator.handle ? `@${creator.handle}` : creator.profileUrl;
    if (!window.confirm(`Remove ${label} from prospects? This only deletes the queued prospect.`)) {
      return;
    }

    setLoading(true);
    setMessage(null);
    try {
      const deleted = await api<CreatorRow | null>(`/api/creators/pending/${creator.id}`, { method: "DELETE" });
      setPending((current) => current.filter((item) => item.id !== creator.id));
      setMessage(`Removed ${deleted?.handle ?? creator.handle ?? "prospect"} from prospects.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not remove prospect");
    } finally {
      setLoading(false);
    }
  }

  async function saveCreator(creator: CreatorRow) {
    setLoading(true);
    setMessage(null);
    try {
      const updated = await api<CreatorRow>(`/api/creators/${creator.id}`, {
        method: "PUT",
        body: JSON.stringify(workflowPayload(creator)),
      });
      const normalizedUpdated = normalizeCreatorRow(updated);
      setCreators((current) => current.map((item) => (item.id === normalizedUpdated.id ? normalizedUpdated : item)));
      setPending((current) => current.map((item) => (item.id === normalizedUpdated.id ? normalizedUpdated : item)));
      await Promise.all([loadCreators(), loadDailyOutreachCounts(), loadCreatorStats()]);
      setSelectedCreatorId((current) => (current === normalizedUpdated.id ? null : current));
      setMessage(`Saved ${normalizedUpdated.handle ?? "creator"}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save creator");
    } finally {
      setLoading(false);
    }
  }

  async function sendEmailFollowUp(creator: CreatorRow) {
    if (!creator.email?.trim() || !creator.emailSubject?.trim() || !creator.emailBody?.trim()) {
      setMessage("An email address, subject, and personalized email are required before sending.");
      return;
    }

    if (!window.confirm(`Send this follow-up to ${creator.email.trim()}? This will record the email as sent.`)) {
      return;
    }

    setLoading(true);
    setMessage(null);
    try {
      await api<CreatorRow>(`/api/creators/${creator.id}`, {
        method: "PUT",
        body: JSON.stringify(workflowPayload(creator)),
      });
      const sent = normalizeCreatorRow(await api<CreatorRow>(`/api/creators/${creator.id}/email-follow-up/send`, { method: "POST" }));
      setCreators((current) => current.map((item) => (item.id === sent.id ? sent : item)));
      await Promise.all([loadCreators(), loadDailyOutreachCounts(), loadCreatorStats()]);
      setMessage(`Sent email to ${sent.handle ?? sent.email ?? "creator"}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not send email follow-up");
    } finally {
      setLoading(false);
    }
  }

  async function sendMarkedEmailFollowUps() {
    const eligible = todoCreators
      .filter((creator) => markedCreatorIds.has(creator.id))
      .filter((creator) => creator.email?.trim() && creator.emailSubject?.trim() && creator.emailBody?.trim());
    const batch = eligible.slice(0, MAX_EMAIL_SEND_BATCH_SIZE);

    if (batch.length === 0) {
      setMessage("Mark at least one creator with a saved email address, subject, and personalized email.");
      return;
    }

    const batchLabel = batch.length === 1 ? "this email" : `${batch.length} emails`;
    const limitNote = eligible.length > batch.length ? ` Only the first ${MAX_EMAIL_SEND_BATCH_SIZE} marked drafts will be sent now.` : "";
    if (!window.confirm(`Send ${batchLabel}? Each successful send will be recorded.${limitNote}`)) {
      return;
    }

    setLoading(true);
    setMessage(null);
    const sentIds = new Set<string>();
    const failures: string[] = [];

    for (const creator of batch) {
      try {
        await api<CreatorRow>(`/api/creators/${creator.id}`, {
          method: "PUT",
          body: JSON.stringify(workflowPayload(creator)),
        });
        const sent = normalizeCreatorRow(await api<CreatorRow>(`/api/creators/${creator.id}/email-follow-up/send`, { method: "POST" }));
        sentIds.add(sent.id);
        setCreators((current) => current.map((item) => (item.id === sent.id ? sent : item)));
      } catch {
        failures.push(creator.handle ?? creator.email ?? "creator");
      }
    }

    setMarkedCreatorIds((current) => new Set([...current].filter((id) => !sentIds.has(id))));
    try {
      await Promise.all([loadCreators(), loadDailyOutreachCounts(), loadCreatorStats()]);
      const summary = `Sent ${sentIds.size} of ${batch.length} email${batch.length === 1 ? "" : "s"}.`;
      setMessage(failures.length > 0 ? `${summary} Not sent: ${failures.join(", ")}.` : summary);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Emails were sent, but the dashboard could not refresh");
    } finally {
      setLoading(false);
    }
  }

  async function archiveCreator(creator: CreatorRow) {
    const label = creator.handle ? `@${creator.handle}` : creator.profileUrl;
    if (!window.confirm(`Archive ${label}? It will be hidden from Todo and Reached Out by default.`)) {
      return;
    }

    const previousCreators = creators;
    const previousMarkedCreatorIds = markedCreatorIds;
    const previousSelectedCreatorId = selectedCreatorId;
    const optimisticCreator: CreatorRow = { ...creator, responseStatus: "Archived" };

    setCreators((current) => current.map((item) => (item.id === creator.id ? optimisticCreator : item)));
    setMarkedCreatorIds((current) => {
      if (!current.has(creator.id)) return current;
      const next = new Set(current);
      next.delete(creator.id);
      return next;
    });
    setSelectedCreatorId((current) => (current === creator.id ? null : current));
    setLoading(true);
    setMessage(`Archived ${creator.handle ?? "creator"}.`);
    try {
      const updated = await api<CreatorRow>(`/api/creators/${creator.id}`, {
        method: "PUT",
        body: JSON.stringify(workflowPayload(optimisticCreator)),
      });
      const normalizedUpdated = normalizeCreatorRow(updated);
      setCreators((current) => current.map((item) => (item.id === normalizedUpdated.id ? normalizedUpdated : item)));
      setMessage(`Archived ${normalizedUpdated.handle ?? "creator"}.`);
      void Promise.all([loadCreators(), loadDailyOutreachCounts(), loadCreatorStats()]).catch((error) => {
        setMessage(error instanceof Error ? error.message : "Archived creator, but could not refresh dashboard data");
      });
    } catch (error) {
      setCreators(previousCreators);
      setMarkedCreatorIds(previousMarkedCreatorIds);
      setSelectedCreatorId(previousSelectedCreatorId);
      setMessage(error instanceof Error ? error.message : "Could not archive creator");
    } finally {
      setLoading(false);
    }
  }

  async function restoreCreator(creator: CreatorRow) {
    const label = creator.handle ? `@${creator.handle}` : creator.profileUrl;
    if (!window.confirm(`Restore ${label} to Reached Out?`)) {
      return;
    }

    const previousCreators = creators;
    const previousMarkedCreatorIds = markedCreatorIds;
    const previousSelectedCreatorId = selectedCreatorId;
    const optimisticCreator: CreatorRow = { ...creator, responseStatus: "No" };

    setCreators((current) => current.map((item) => (item.id === creator.id ? optimisticCreator : item)));
    setMarkedCreatorIds((current) => {
      if (!current.has(creator.id)) return current;
      const next = new Set(current);
      next.delete(creator.id);
      return next;
    });
    setSelectedCreatorId((current) => (current === creator.id ? null : current));
    setLoading(true);
    setMessage(`Restored ${creator.handle ?? "creator"}.`);
    try {
      const updated = await api<CreatorRow>(`/api/creators/${creator.id}`, {
        method: "PUT",
        body: JSON.stringify(workflowPayload(optimisticCreator)),
      });
      const normalizedUpdated = normalizeCreatorRow(updated);
      setCreators((current) => current.map((item) => (item.id === normalizedUpdated.id ? normalizedUpdated : item)));
      setMessage(`Restored ${normalizedUpdated.handle ?? "creator"}.`);
      void Promise.all([loadCreators(), loadDailyOutreachCounts(), loadCreatorStats()]).catch((error) => {
        setMessage(error instanceof Error ? error.message : "Restored creator, but could not refresh dashboard data");
      });
    } catch (error) {
      setCreators(previousCreators);
      setMarkedCreatorIds(previousMarkedCreatorIds);
      setSelectedCreatorId(previousSelectedCreatorId);
      setMessage(error instanceof Error ? error.message : "Could not restore creator");
    } finally {
      setLoading(false);
    }
  }

  async function completePending(creator: CreatorRow) {
    setLoading(true);
    setMessage(null);
    try {
      const completed = await api<CreatorRow>(`/api/creators/pending/${creator.id}/complete`, {
        method: "POST",
        body: JSON.stringify({ ...workflowPayload(creator), lastContactDate: today() }),
      });
      setPending((current) => current.filter((item) => item.id !== creator.id));
      setCreators((current) => [normalizeCreatorRow(completed), ...current]);
      await Promise.all([loadDailyOutreachCounts(), loadCreatorStats()]);
      setMessage(`Completed ${completed.handle ?? "creator"}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not complete prospect");
    } finally {
      setLoading(false);
    }
  }

  async function copyPendingList() {
    const text = filteredPending
      .map((creator, index) => `${index + 1}. ${creator.handle ? `@${creator.handle}` : "unknown"} | ${creatorPlatformName(creator)} | ${creator.profileUrl}${creator.threadsUrl ? ` | Threads: ${creator.threadsUrl}` : ""}`)
      .join("\n");

    try {
      await navigator.clipboard.writeText(text);
      setMessage("Prospect list copied.");
    } catch {
      setMessage(text || "No prospects queued to copy.");
    }
  }

  async function copyText(text: string | null | undefined, label: string) {
    const value = text?.trim();
    if (!value) {
      setMessage(`No ${label.toLowerCase()} to copy.`);
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      setMessage(`${label} copied.`);
    } catch {
      setMessage(value);
    }
  }

  function updateTemplateForm(kind: TemplateKind, update: Partial<TemplateForm>) {
    setTemplateForms((current) => ({
      ...current,
      [kind]: { ...current[kind], ...update, kind },
    }));
  }

  function resetTemplateForm(kind: TemplateKind) {
    setTemplateForms((current) => ({ ...current, [kind]: emptyTemplateForm(kind) }));
  }

  function editTemplate(template: MessageTemplate) {
    const kind = templateKind(template);
    setTemplateForms((current) => ({
      ...current,
      [kind]: {
        id: template.id,
        kind,
        name: template.name,
        subject: template.subject ?? "",
        body: template.body,
        generationRules: template.generationRules ?? "",
        activate: template.isActive,
      },
    }));
  }

  async function saveTemplate(event: FormEvent, kind: TemplateKind) {
    event.preventDefault();
    const templateForm = templateForms[kind];
    const duplicate = findTemplateNameConflict(templates, templateForm.name, templateForm.id, kind);
    if (duplicate) {
      setMessage(`A template named ${duplicate.name} already exists.`);
      return;
    }

    setLoading(true);
    setMessage(null);
    try {
      const kindQuery = new URLSearchParams({ kind }).toString();
      const path = templateForm.id ? `/api/templates/${templateForm.id}?${kindQuery}` : `/api/templates?${kindQuery}`;
      const saved = await api<MessageTemplate>(path, {
        method: templateForm.id ? "PUT" : "POST",
        body: JSON.stringify({
          name: templateForm.name,
          kind,
          type: kind,
          subject: kind === "Email" ? emptyToNull(templateForm.subject) : null,
          body: templateForm.body,
          generationRules: emptyToNull(templateForm.generationRules),
          activate: templateForm.activate,
        }),
      });
      const normalizedSaved = normalizeTemplate(saved, kind);
      setTemplates((current) => sortTemplates([normalizedSaved, ...current.filter((template) => template.id !== normalizedSaved.id)]));
      const rawPersistedTemplates = await api<MessageTemplate[]>("/api/templates");
      const rawPersisted = rawPersistedTemplates.find((template) => template.id === normalizedSaved.id);
      if (!rawPersisted) {
        throw new Error("Template save succeeded, but the saved template did not reload from Postgres. Refresh and check the API.");
      }
      const persistedKind = explicitTemplateKind(rawPersisted);
      if (persistedKind !== kind) {
        throw new Error(`Template save reloaded as ${persistedKind ?? "missing kind"} instead of ${kind}. The API did not persist the selected template kind.`);
      }

      const persistedTemplates = sortTemplates(rawPersistedTemplates.map((template) => normalizeTemplate(template)));
      setTemplates(persistedTemplates);
      const persisted = persistedTemplates.find((template) => template.id === normalizedSaved.id);
      if (!persisted) {
        throw new Error("Template save succeeded, but the saved template did not reload from Postgres. Refresh and check the API.");
      }

      resetTemplateForm(kind);
      setMessage(`Saved template ${persisted.name} to Postgres.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save template");
    } finally {
      setLoading(false);
    }
  }

  async function activateTemplate(template: MessageTemplate) {
    setLoading(true);
    setMessage(null);
    try {
      const activated = await api<MessageTemplate>(`/api/templates/${template.id}/activate`, { method: "POST" });
      await loadTemplates();
      setMessage(`${activated.name} is now active.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not activate template");
    } finally {
      setLoading(false);
    }
  }

  async function deleteTemplate(template: MessageTemplate) {
    if (!window.confirm(`Delete template "${template.name}"? Existing creator messages will stay as they are.`)) {
      return;
    }

    setLoading(true);
    setMessage(null);
    try {
      const deleted = await api<MessageTemplate>(`/api/templates/${template.id}`, { method: "DELETE" });
      await loadTemplates();
      const kind = templateKind(template);
      setTemplateForms((current) => (current[kind].id === template.id ? { ...current, [kind]: emptyTemplateForm(kind) } : current));
      setMessage(deleted.isActive ? `Deleted active template ${deleted.name}. No template is active.` : `Deleted template ${deleted.name}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not delete template");
    } finally {
      setLoading(false);
    }
  }

  function updatePending(id: string, update: Partial<CreatorRow>) {
    setPending((current) => current.map((item) => (item.id === id ? { ...item, ...update } : item)));
  }

  function updateCreatorDraft(id: string, update: Partial<CreatorRow>) {
    setCreators((current) => current.map((item) => {
      if (item.id !== id) {
        return item;
      }

      const effectiveCreator = applyActiveEmailTemplateDefaults(item, activeEmailTemplate) ?? item;
      return { ...item, ...preserveEffectiveEmailDraft(effectiveCreator, update) };
    }));
  }

  function selectCreatorForEdit(id: string) {
    setSelectedCreatorId(id);
  }

  function toggleCreatorMark(id: string) {
    setMarkedCreatorIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }

      return next;
    });
  }

  function toggleTodoCreatorExpansion(id: string) {
    setExpandedTodoCreatorIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }

      return next;
    });
  }

  function markVisibleCreators() {
    setMarkedCreatorIds(new Set(visibleBulkCreators.map((creator) => creator.id)));
  }

  function clearMarkedCreators() {
    setMarkedCreatorIds(new Set());
  }

  function updateTodoFilter<Key extends keyof TodoFilters>(key: Key, value: TodoFilters[Key]) {
    setTodoFilters((current) => ({ ...current, [key]: value }));
  }

  async function applyBulkUpdate(event: FormEvent) {
    event.preventDefault();
    const creatorIds = [...markedCreatorIds].filter((id) => visibleBulkCreatorIds.has(id));

    if (creatorIds.length === 0) {
      setMarkedCreatorIds(new Set());
      setMessage("Mark at least one visible creator before applying a bulk edit.");
      return;
    }

    const template = bulkEdit.setMessage ? dmTemplates.find((item) => item.id === bulkEdit.messageTemplateId) : null;
    if (bulkEdit.setMessage && !template) {
      setMessage("Choose a template for the bulk message update.");
      return;
    }

    const hasDateUpdate =
      (bulkEdit.setFirstMessageDate && bulkEdit.firstMessageDate) ||
      (bulkEdit.setLastContactDate && bulkEdit.lastContactDate);

    if (!hasDateUpdate && !bulkEdit.setResponseStatus && !bulkEdit.setMessage) {
      setMessage("Choose at least one bulk field to update.");
      return;
    }

    if (creatorIds.length >= 10) {
      const confirmed = window.confirm(`Apply this bulk edit to ${creatorIds.length} marked creator${creatorIds.length === 1 ? "" : "s"}?`);
      if (!confirmed) return;
    }

    setLoading(true);
    setMessage(null);
    try {
      const updated = await api<CreatorRow[]>("/api/creators/bulk", {
        method: "PUT",
        body: JSON.stringify({
          creatorIds,
          firstMessageDate: bulkEdit.setFirstMessageDate ? emptyToNull(bulkEdit.firstMessageDate) : null,
          lastContactDate: bulkEdit.setLastContactDate ? emptyToNull(bulkEdit.lastContactDate) : null,
          setResponseStatus: bulkEdit.setResponseStatus,
          responseStatus: bulkEdit.setResponseStatus ? bulkEdit.responseStatus : null,
          setMessage: bulkEdit.setMessage,
          messageTemplateId: template?.id ?? null,
          messageVersion: template?.name ?? null,
          messageBody: template?.body ?? null,
        }),
      });

      setCreators((current) => {
        const updatedById = new Map(updated.map((creator) => [creator.id, creator]));
        return current.map((creator) => updatedById.get(creator.id) ?? creator);
      });
      await Promise.all([loadCreators(), loadDailyOutreachCounts(), loadCreatorStats()]);
      setSelectedCreatorId(null);
      setMarkedCreatorIds(new Set());
      const requestedCount = creatorIds.length;
      setMessage(
        updated.length === requestedCount
          ? `Updated ${updated.length} creator${updated.length === 1 ? "" : "s"}.`
          : `Updated ${updated.length} of ${requestedCount} creators. Refresh and check filters if any marked rows did not change.`
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not apply bulk update");
    } finally {
      setLoading(false);
    }
  }

  async function archiveMarkedCreators() {
    const creatorIds = [...markedCreatorIds].filter((id) => visibleBulkCreatorIds.has(id));

    if (creatorIds.length === 0) {
      setMarkedCreatorIds(new Set());
      setMessage("Mark at least one visible creator before archiving.");
      return;
    }

    const confirmed = window.confirm(`Archive ${creatorIds.length} marked creator${creatorIds.length === 1 ? "" : "s"}? They will be hidden from Todo and Reached Out by default.`);
    if (!confirmed) return;

    const ids = new Set(creatorIds);
    const previousCreators = creators;
    const previousMarkedCreatorIds = markedCreatorIds;
    const previousSelectedCreatorId = selectedCreatorId;

    setCreators((current) => current.map((creator) => (ids.has(creator.id) ? { ...creator, responseStatus: "Archived" } : creator)));
    setMarkedCreatorIds(new Set());
    setSelectedCreatorId((current) => (current && ids.has(current) ? null : current));
    setLoading(true);
    setMessage(`Archived ${creatorIds.length} creator${creatorIds.length === 1 ? "" : "s"}.`);

    try {
      await api<CreatorRow[]>("/api/creators/bulk", {
        method: "PUT",
        body: JSON.stringify({
          creatorIds,
          firstMessageDate: null,
          lastContactDate: null,
          setResponseStatus: true,
          responseStatus: "Archived",
          setMessage: false,
          messageTemplateId: null,
          messageVersion: null,
          messageBody: null,
        }),
      });

      setMessage(`Archived ${creatorIds.length} creator${creatorIds.length === 1 ? "" : "s"}.`);
      void Promise.all([loadCreators(), loadDailyOutreachCounts(), loadCreatorStats()]).catch((error) => {
        setMessage(error instanceof Error ? error.message : "Archived creators, but could not refresh dashboard data");
      });
    } catch (error) {
      setCreators(previousCreators);
      setMarkedCreatorIds(previousMarkedCreatorIds);
      setSelectedCreatorId(previousSelectedCreatorId);
      setMessage(error instanceof Error ? error.message : "Could not archive marked creators");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="app-shell">
      <div className={`top-progress ${loading ? "active" : ""}`} role="presentation" aria-hidden="true" />
      <section className="dashboard-overview" aria-label="Dashboard navigation and summary">
        <header className="topbar">
          <div className="topbar-heading">
            <div className="eyebrow-row">
              <p className="eyebrow">Creator outreach</p>
              <span className={`live-badge ${liveStatus}`}><span className="live-dot" aria-hidden="true" />{liveStatusLabel(liveStatus)}</span>
            </div>
            <h1>Outreach dashboard</h1>
          </div>
          <ViewTabs
            view={view}
            onSelect={(item) => {
              setSelectedCreatorId(null);
              setView(item);
            }}
          />
        </header>

        <section className="stats-strip" aria-label="Outreach stats">
          {stats.map((stat) => (
            <article className="stat" key={stat.label} title={stat.detail}>
              <span>{stat.label}</span>
              <strong><AnimatedNumber value={stat.value} /></strong>
              <small>{stat.detail}</small>
            </article>
          ))}
        </section>
      </section>

      {message && <p className="status-message" role="status" aria-live="polite">{message}</p>}

      {view === "reachedOut" && (
        <section className="dashboard-grid">
          <article className="panel pipeline-panel">
            <div className="panel-header">
              <div>
                <h2>Reached Out</h2>
                <p>Completed and contacted creator records, with response status and message context.</p>
              </div>
              <div className="panel-actions">
                <button
                  type="button"
                  className={`secondary compact-button archived-toggle ${filters.responseStatus === "Archived" ? "active" : ""}`}
                  onClick={() => updateFilter("responseStatus", filters.responseStatus === "Archived" ? "all" : "Archived")}
                  aria-pressed={filters.responseStatus === "Archived"}
                  title={filters.responseStatus === "Archived" ? "Hide archived creators" : "Show archived creators"}
                >
                  Archived
                </button>
                <label className="header-control">
                  <span>Sort</span>
                  <select aria-label="Sort creators" value={filters.sortField} onChange={(event) => updateFilter("sortField", event.target.value as ReachedOutSortField)}>
                    <option value="followers">Followers</option>
                    <option value="firstDate">First date</option>
                    <option value="lastDate">Last date</option>
                    <option value="notInterested">Not Interested first</option>
                  </select>
                </label>
                <button
                  type="button"
                  className="secondary compact-button sort-direction-button"
                  onClick={() => updateFilter("sortDirection", filters.sortDirection === "asc" ? "desc" : "asc")}
                  disabled={filters.sortField === "notInterested"}
                  aria-label={`Sort ${filters.sortDirection === "asc" ? "descending" : "ascending"}`}
                  title={filters.sortField === "notInterested" ? "Direction does not apply to this sort" : "Toggle sort direction"}
                >
                  {filters.sortDirection === "asc" ? "Asc ↑" : "Desc ↓"}
                </button>
                {hasActiveFilters && <button type="button" className="secondary compact-button" onClick={() => setFilters(emptyFilters)}>Clear filters</button>}
                <button type="button" className="secondary compact-button" onClick={() => void refreshAll()} disabled={loading}>Refresh</button>
              </div>
            </div>

            <ConversionFunnel summary={creatorConversionSummary} />

            <BulkEditBar
              form={bulkEdit}
              templates={dmTemplates}
              loading={loading}
              markedCount={markedCreatorIds.size}
              visibleCount={filteredCreators.length}
              loadedCount={creators.length}
              onChange={setBulkEdit}
              onSelectVisible={markVisibleCreators}
              onClearMarked={clearMarkedCreators}
              onArchiveMarked={archiveMarkedCreators}
              onSubmit={applyBulkUpdate}
            />

            {selectedCreator && (
              <CreatorEditPanel
                ref={editPanelRef}
                creator={selectedCreator}
                dmTemplates={dmTemplates}
                emailTemplates={emailTemplates}
                creatorCode={displayCreatorCode(selectedCreator, codeByCreatorId)}
                onChange={(update) => updateCreatorDraft(selectedCreator.id, preserveEffectiveEmailDraft(selectedCreator, update))}
                onSave={() => void saveCreator(selectedCreator)}
              />
            )}

            <CreatorTable
              creators={filteredCreators}
              codeByCreatorId={codeByCreatorId}
              emptyText={creators.length === 0 ? "No contacted creators yet. Complete a prospect after sending to move them here." : "No reached-out creators match these filters."}
              selectedCreatorId={selectedCreatorId}
              markedCreatorIds={markedCreatorIds}
              onSelect={selectCreatorForEdit}
              onToggleMark={toggleCreatorMark}
              onArchive={(creator) => void archiveCreator(creator)}
              onRestore={(creator) => void restoreCreator(creator)}
              onCopyText={copyText}
              filters={filters}
              onFilterChange={updateFilter}
            />
          </article>

        </section>
      )}

      {view === "prospecting" && (
        <section className="dashboard-grid prospecting-grid">
          <article className="panel prospecting-add">
            <div className="panel-header">
              <div>
                <h2>Prospecting</h2>
                <p>Paste a new Instagram or TikTok profile URL, then personalize the message before sending.</p>
              </div>
              <div className="active-template">
                <span>Active DM template</span>
                <strong>{activeDmTemplate?.name ?? "None"}</strong>
              </div>
            </div>
            <form className="add-grid" onSubmit={(event) => void addPendingCreator(event)}>
              <label className="wide-field">
                <span>Profile URL</span>
                <input
                  required
                  aria-describedby="prospect-url-feedback"
                  aria-invalid={prospectDuplicateMessage ? true : undefined}
                  placeholder="https://www.instagram.com/handle"
                  value={pendingForm.profileUrl}
                  onChange={(event) => setPendingForm({ ...pendingForm, profileUrl: event.target.value })}
                />
                {(prospectUrlChecking || prospectDuplicateMessage || prospectUrlError) && (
                  <small
                    id="prospect-url-feedback"
                    className={`field-feedback ${prospectDuplicateMessage ? "error" : ""}`}
                  >
                    {prospectDuplicateMessage ?? prospectUrlError ?? "Checking profile..."}
                  </small>
                )}
              </label>
              <label>
                <span>Followers</span>
                <input inputMode="numeric" placeholder="Manual" value={pendingForm.followers} onChange={(event) => setPendingForm({ ...pendingForm, followers: numericText(event.target.value) })} />
              </label>
              <label>
                <span>First date</span>
                <input type="date" value={pendingForm.firstMessageDate} onChange={(event) => setPendingForm({ ...pendingForm, firstMessageDate: event.target.value })} />
              </label>
              <label>
                <span>Email</span>
                <input value={pendingForm.email} onChange={(event) => setPendingForm({ ...pendingForm, email: event.target.value })} />
              </label>
              <label>
                <span>Threads</span>
                <input placeholder="https://www.threads.com/@handle" value={pendingForm.threadsUrl} onChange={(event) => setPendingForm({ ...pendingForm, threadsUrl: event.target.value })} />
              </label>
              <button type="submit" disabled={loading || prospectUrlChecking || Boolean(prospectDuplicateMessage)}>Add prospect</button>
            </form>
          </article>

          <article className="panel prospecting-pending">
            <div className="panel-header">
              <div>
                <h2>Prospects</h2>
                <p>{pendingSummaryText}</p>
              </div>
              <div className="prospect-list-actions">
                <PlatformToggle
                  value={pendingPlatformFilter}
                  onChange={setPendingPlatformFilter}
                />
                <ProspectReadinessToggle
                  value={pendingReadinessFilter}
                  onChange={setPendingReadinessFilter}
                />
                <button type="button" className="secondary compact-button" onClick={() => void copyPendingList()}>Copy prospects</button>
              </div>
            </div>
            <div className="pending-list">
              {filteredPending.map((creator, index) => (
                <PendingCreatorCard
                  key={creator.id}
                  creator={creator}
                  index={index}
                  templates={dmTemplates}
                  onChange={(update) => updatePending(creator.id, update)}
                  onSave={() => void saveCreator(creator)}
                  onComplete={() => void completePending(creator)}
                  onDelete={() => void deletePending(creator)}
                  onCopyMessage={() => void copyText(creator.messageBody, "Personalized message")}
                />
              ))}
              {pending.length === 0 && <p className="empty-copy">No prospects queued. Paste a profile URL to prepare your next outreach.</p>}
              {pending.length > 0 && filteredPending.length === 0 && <p className="empty-copy">No {pendingReadinessFilter} prospects match these filters.</p>}
            </div>
          </article>

          <div className="template-column prospecting-tools">
            <details className="panel disclosure-panel pipeline-prompt-panel">
              <summary>
                <span><strong>Review prompt</strong><small>Open when handing this queue to a reviewer.</small></span>
                <span className="disclosure-chevron" aria-hidden="true">⌄</span>
              </summary>
              <div className="disclosure-body">
                <button type="button" className="secondary compact-button disclosure-copy" onClick={() => void copyText(pipelinePrompt, "Review prompt")}>Copy prompt</button>
                <p className="pipeline-prompt-text">{pipelinePrompt}</p>
              </div>
            </details>
          </div>
        </section>
      )}

      {view === "templates" && (
        <TemplatesView
          dmTemplates={dmTemplates}
          emailTemplates={emailTemplates}
          templateForms={templateForms}
          loading={loading}
          onFormChange={updateTemplateForm}
          onSubmit={(event, kind) => void saveTemplate(event, kind)}
          onEdit={editTemplate}
          onActivate={(template) => void activateTemplate(template)}
          onDelete={(template) => void deleteTemplate(template)}
          onCancel={resetTemplateForm}
        />
      )}

      {view === "todo" && (
        <section className="dashboard-grid">
          <article className="panel pipeline-panel">
            <div className="panel-header">
              <div>
                <h2>Todo</h2>
                <p>Follow-up candidates based on contact age and whether there is a useful next contact path.</p>
              </div>
              <div className="panel-actions">
                {hasActiveTodoFilters && <button type="button" className="secondary compact-button" onClick={() => setTodoFilters(defaultTodoFilters)}>Reset todo filters</button>}
                <button type="button" className="secondary compact-button" onClick={() => void refreshAll()} disabled={loading}>Refresh</button>
              </div>
            </div>

            <TodoFilterPanel
              filters={todoFilters}
              matchCount={todoCreators.length}
              onChange={updateTodoFilter}
            />

            <BulkEditBar
              form={bulkEdit}
              templates={dmTemplates}
              loading={loading}
              markedCount={markedCreatorIds.size}
              visibleCount={todoCreators.length}
              loadedCount={creators.length}
              onChange={setBulkEdit}
              onSelectVisible={markVisibleCreators}
              onClearMarked={clearMarkedCreators}
              onArchiveMarked={archiveMarkedCreators}
              onSendMarkedEmails={() => void sendMarkedEmailFollowUps()}
              onSubmit={applyBulkUpdate}
            />

            {selectedCreator && (
              <CreatorEditPanel
                ref={editPanelRef}
                creator={selectedCreator}
                dmTemplates={dmTemplates}
                emailTemplates={emailTemplates}
                creatorCode={displayCreatorCode(selectedCreator, codeByCreatorId)}
                onChange={(update) => updateCreatorDraft(selectedCreator.id, preserveEffectiveEmailDraft(selectedCreator, update))}
                onSave={() => void saveCreator(selectedCreator)}
              />
            )}

            <CreatorTable
              creators={todoCreators}
              codeByCreatorId={codeByCreatorId}
              emptyText="No creators match the current todo filters."
              selectedCreatorId={selectedCreatorId}
              markedCreatorIds={markedCreatorIds}
              onSelect={selectCreatorForEdit}
              onToggleMark={toggleCreatorMark}
              onArchive={(creator) => void archiveCreator(creator)}
              onCopyText={copyText}
              searchQuery={todoFilters.query}
              onSearchChange={(value) => updateTodoFilter("query", value)}
              emailTemplates={emailTemplates}
              expandedCreatorIds={expandedTodoCreatorIds}
              onToggleExpand={toggleTodoCreatorExpansion}
              onChangeCreator={updateCreatorDraft}
              onSaveCreator={(creator) => void saveCreator(creator)}
              onSendEmailFollowUp={(creator) => void sendEmailFollowUp(creator)}
            />
          </article>
        </section>
      )}

      {view === "creatorCodes" && (
        <CreatorCodesView
          codes={creatorCodes}
          creators={creators}
          form={creatorCodeForm}
          includeInactive={includeInactiveCodes}
          loading={loading}
          onFormChange={setCreatorCodeForm}
          onIncludeInactiveChange={setIncludeInactiveCodes}
          onCreate={createCreatorCode}
          onRefresh={() => void refreshAll()}
          onOpenCreator={(id) => {
            setSelectedCreatorId(id);
            setView("reachedOut");
          }}
          onPatch={(code, patch) => void updateCreatorCode(code, patch)}
          onDelete={(code) => void deleteCreatorCode(code)}
        />
      )}
    </main>
  );
}

function ConversionFunnel({ summary }: { summary: CreatorConversionSummary }) {
  const stages = [
    { label: "Reached out", value: summary.reachedOutCount, detail: "Contacted creators" },
    { label: "Responded", value: summary.respondedCreatorCount, detail: `${rate(summary.respondedCreatorCount, summary.reachedOutCount)} of reached out` },
    { label: "Ongoing", value: summary.ongoingCreatorCount, detail: `${formatPercentValue(summary.replyToRedeemRate)} reply to redeem` },
    { label: "Active", value: summary.activatedCreatorCount, detail: `${formatPercentValue(summary.redeemToTrialRate)} redeem to trial` },
    { label: "Converted", value: summary.convertedCreatorCount, detail: `${formatPercentValue(summary.trialToPaidRate)} trial to paid` },
  ];
  const max = Math.max(1, ...stages.map((stage) => stage.value));

  return (
    <details className="conversion-funnel" aria-label="Creator conversion funnel">
      <summary>
        <span className="disclosure-title">Conversion funnel</span>
        <span className="funnel-summary-metrics">
          <span><strong>{formatNumber(summary.reachedOutCount)}</strong> reached</span>
          <span><strong>{formatNumber(summary.respondedCreatorCount)}</strong> responded</span>
          <span><strong>{formatNumber(summary.convertedCreatorCount)}</strong> converted</span>
        </span>
        <span className="disclosure-chevron" aria-hidden="true">⌄</span>
      </summary>
      <div className="funnel-grid">
        {stages.map((stage) => (
          <div className="funnel-step" key={stage.label}>
            <div className="funnel-step-head">
              <span>{stage.label}</span>
              <strong>{formatNumber(stage.value)}</strong>
            </div>
            <div className="funnel-meter" aria-hidden="true">
              <span style={{ width: `${Math.max(6, (stage.value / max) * 100)}%` }} />
            </div>
            <small>{stage.detail}</small>
          </div>
        ))}
      </div>
    </details>
  );
}

function creatorLabel(creator: CreatorRow) {
  return creator.handle ?? creator.profileUrl;
}

function CreatorSelect({
  creators,
  value,
  onChange,
}: {
  creators: CreatorRow[];
  value: string;
  onChange: (creatorId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const selected = useMemo(() => creators.find((creator) => creator.id === value) ?? null, [creators, value]);

  // While closed, mirror the selected creator's label so the field reads as a normal picker.
  const inputValue = open ? query : selected ? creatorLabel(selected) : "";

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return creators.slice(0, 50);
    return creators
      .filter((creator) => {
        const handle = (creator.handle ?? "").toLowerCase();
        const url = (creator.profileUrl ?? "").toLowerCase();
        return handle.includes(needle) || url.includes(needle);
      })
      .slice(0, 50);
  }, [creators, query]);

  useEffect(() => {
    if (!open) return;
    const handleClick = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const choose = (creator: CreatorRow) => {
    onChange(creator.id);
    setOpen(false);
    setQuery("");
  };

  return (
    <div className="creator-select" ref={containerRef}>
      <input
        type="text"
        value={inputValue}
        placeholder="Search creator by handle or URL"
        autoComplete="off"
        onFocus={() => {
          setOpen(true);
          setQuery("");
          setHighlight(0);
        }}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
          setHighlight(0);
        }}
        onKeyDown={(event) => {
          if (!open) return;
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setHighlight((index) => Math.min(index + 1, matches.length - 1));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setHighlight((index) => Math.max(index - 1, 0));
          } else if (event.key === "Enter") {
            if (matches[highlight]) {
              event.preventDefault();
              choose(matches[highlight]);
            }
          } else if (event.key === "Escape") {
            setOpen(false);
            setQuery("");
          }
        }}
      />
      {open && (
        <ul className="creator-select-menu" role="listbox">
          {matches.length === 0 ? (
            <li className="creator-select-empty">No creators match.</li>
          ) : (
            matches.map((creator, index) => (
              <li
                key={creator.id}
                role="option"
                aria-selected={creator.id === value}
                className={`creator-select-option ${index === highlight ? "highlight" : ""} ${creator.id === value ? "selected" : ""}`}
                onMouseEnter={() => setHighlight(index)}
                onMouseDown={(event) => {
                  event.preventDefault();
                  choose(creator);
                }}
              >
                {creatorLabel(creator)}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

function CreatorCodesView({
  codes,
  creators,
  form,
  includeInactive,
  loading,
  onFormChange,
  onIncludeInactiveChange,
  onCreate,
  onRefresh,
  onOpenCreator,
  onPatch,
  onDelete,
}: {
  codes: CreatorCode[];
  creators: CreatorRow[];
  form: CreatorCodeForm;
  includeInactive: boolean;
  loading: boolean;
  onFormChange: (form: CreatorCodeForm) => void;
  onIncludeInactiveChange: (value: boolean) => void;
  onCreate: (event: FormEvent) => void;
  onRefresh: () => void;
  onOpenCreator: (id: string) => void;
  onPatch: (code: CreatorCode, patch: CreatorCodePatch) => void;
  onDelete: (code: CreatorCode) => void;
}) {
  const summary = useMemo(() => summarizeCreatorCodes(codes), [codes]);

  return (
    <section className="dashboard-grid">
      <article className="panel codes-panel">
        <div className="panel-header">
          <div>
            <h2>Creator Codes</h2>
            <p>{includeInactive ? "Showing active, disabled, and expired creator codes." : "Showing active creator codes."}</p>
          </div>
          <div className="panel-actions">
            <label className="check-row code-toggle">
              <input type="checkbox" checked={includeInactive} onChange={(event) => onIncludeInactiveChange(event.target.checked)} />
              <span>Include inactive</span>
            </label>
            <button type="button" className="secondary compact-button" onClick={onRefresh} disabled={loading}>Refresh</button>
          </div>
        </div>

        <section className="code-summary-strip" aria-label="Visible creator code summary">
          <article className="code-summary-item">
            <span>Visible codes</span>
            <strong>{formatNumber(codes.length)}</strong>
            <small>{formatNumber(summary.activeCount)} active</small>
          </article>
          <article className="code-summary-item">
            <span>Redemptions</span>
            <strong>{formatNumber(summary.ongoingCount)}</strong>
            <small>{formatNumber(summary.activatedCount)} activated</small>
          </article>
          <article className="code-summary-item">
            <span>Conversions</span>
            <strong>{formatNumber(summary.convertedCount)}</strong>
            <small>{rate(summary.convertedCount, summary.ongoingCount)} redeemed to paid</small>
          </article>
          <article className="code-summary-item">
            <span>Expiring soon</span>
            <strong>{formatNumber(summary.expiringSoonCount)}</strong>
            <small>Within 14 days</small>
          </article>
          <article className="code-summary-item">
            <span>Zero redemptions</span>
            <strong>{formatNumber(summary.zeroRedemptionCount)}</strong>
            <small>Delete candidates</small>
          </article>
        </section>

        <form className="creator-code-form" onSubmit={onCreate}>
          <label>
            <span>Code</span>
            <input
              required
              value={form.code}
              onChange={(event) => onFormChange({ ...form, code: event.target.value.toUpperCase() })}
              placeholder="CREATOR20"
            />
          </label>
          <label className="wide-field">
            <span>Creator</span>
            <CreatorSelect
              creators={creators}
              value={form.creatorId}
              onChange={(creatorId) => onFormChange({ ...form, creatorId })}
            />
          </label>
          <label>
            <span>Premium days</span>
            <input inputMode="numeric" value={form.premiumDurationDays} onChange={(event) => onFormChange({ ...form, premiumDurationDays: numericText(event.target.value) })} />
          </label>
          <label>
            <span>Valid from</span>
            <input type="date" value={form.validFrom} onChange={(event) => onFormChange({ ...form, validFrom: event.target.value })} />
          </label>
          <label>
            <span>Valid until</span>
            <input type="date" value={form.validUntil} onChange={(event) => onFormChange({ ...form, validUntil: event.target.value })} />
          </label>
          <label>
            <span>Status</span>
            <select value={form.status} onChange={(event) => onFormChange({ ...form, status: event.target.value as CreatorCodeStatus })}>
              <option value="active">active</option>
              <option value="disabled">disabled</option>
              <option value="expired">expired</option>
            </select>
          </label>
          <button type="submit" disabled={loading}>Create code</button>
        </form>

        <div className="code-card-list">
          {codes.length === 0 ? (
            <p className="code-card-empty">No creator codes match this view.</p>
          ) : (
            codes.map((code) => (
              <CreatorCodeTableRow
                key={code.id}
                code={code}
                loading={loading}
                onOpenCreator={onOpenCreator}
                onPatch={onPatch}
                onDelete={onDelete}
              />
            ))
          )}
        </div>
      </article>
    </section>
  );
}

function CreatorCodeTableRow({
  code,
  loading,
  onOpenCreator,
  onPatch,
  onDelete,
}: {
  code: CreatorCode;
  loading: boolean;
  onOpenCreator: (id: string) => void;
  onPatch: (code: CreatorCode, patch: CreatorCodePatch) => void;
  onDelete: (code: CreatorCode) => void;
}) {
  const [creatorDisplayName, setCreatorDisplayName] = useState(code.creatorDisplayName ?? "");
  const [validUntil, setValidUntil] = useState(dateInputValue(code.validUntil));
  const [premiumDurationDays, setPremiumDurationDays] = useState(String(code.premiumDurationDays ?? ""));
  const [status, setStatus] = useState<CreatorCodeStatus>(code.status);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setCreatorDisplayName(code.creatorDisplayName ?? "");
    setValidUntil(dateInputValue(code.validUntil));
    setPremiumDurationDays(String(code.premiumDurationDays ?? ""));
    setStatus(code.status);
  }, [code]);

  const saveInlineEdits = () => {
    const premiumDays = toNullableNumber(premiumDurationDays);
    if (!premiumDays || premiumDays <= 0) return;

    onPatch(code, {
      creatorDisplayName: emptyToNull(creatorDisplayName),
      validUntil: dateInputToUtcIso(validUntil),
      premiumDurationDays: premiumDays,
      status,
    });
  };

  const redeemed = Math.max(0, code.ongoingCount);
  const trial = Math.max(0, code.activatedCount);
  const paid = Math.max(0, code.convertedCount);
  const trialPct = redeemed ? Math.round((trial / redeemed) * 100) : 0;
  const paidPct = trial ? Math.round((paid / trial) * 100) : 0;
  const redeemedRange = code.firstRedeemedAt || code.lastRedeemedAt;
  const reportHeadline = redeemed === 0
    ? "Your code is ready to share"
    : `${formatNumber(redeemed)} ${redeemed === 1 ? "person has" : "people have"} redeemed your code`;
  const reportIntro = redeemed === 0
    ? "We’ll show activity here as your community starts using it."
    : "Here’s how those redemptions are progressing so far.";

  return (
    <div className={expanded ? "code-card expanded" : "code-card"}>
      <button
        type="button"
        className="code-card-head"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
      >
        <span className="code-card-toggle" aria-hidden="true">{expanded ? "−" : "+"}</span>
        <span className="code-meta code-meta-code">
          <span className="code-field-label">Code</span>
          <strong className="creator-code-value">{code.code}</strong>
        </span>
        <span className="code-meta code-meta-creator">
          <span className="code-field-label">Creator</span>
          <span className="code-meta-value">{code.creatorDisplayName || "—"}</span>
        </span>
        <span className="code-meta code-meta-hide-sm">
          <span className="code-field-label">Premium</span>
          <span className="code-meta-value">{code.premiumDurationDays ? `${code.premiumDurationDays} days` : "—"}</span>
        </span>
        <span className="code-meta code-meta-hide-sm">
          <span className="code-field-label">Redeemed</span>
          <span className="code-meta-value">{formatNumber(redeemed)}</span>
        </span>
        <span className="code-meta code-meta-status">
          <span className="code-field-label">Status</span>
          <span className={`code-status-pill ${statusPillClass(code.status, validUntil)}`}>{statusPillLabel(code.status, validUntil)}</span>
        </span>
      </button>

      {expanded && (
        <div className="code-card-body">
          <figure className="code-report">
            <div className="code-report-head">
              <div className="code-report-brand">
                <span className="code-report-wordmark">VOLUME</span>
                <span className="code-report-eyebrow">Creator partner update</span>
              </div>
              <span className={`code-status-pill ${statusPillClass(code.status, validUntil)}`}>{statusPillLabel(code.status, validUntil)}</span>
            </div>

            <div className="code-report-hero">
              <div className="code-report-summary">
                <span className="code-report-kicker">Your code activity</span>
                <strong className="code-report-headline">{reportHeadline}</strong>
                <span className="code-report-intro">{reportIntro}</span>
              </div>
              <div className="code-report-id">
                <span className="code-report-id-label">Creator code</span>
                <strong className="code-report-code">{code.code}</strong>
                <span className="code-report-sub">
                  {code.creatorDisplayName || "Creator partner"}
                  {code.premiumDurationDays ? ` · ${code.premiumDurationDays} days of Premium` : ""}
                </span>
              </div>
            </div>

            <div className="code-funnel" aria-label="Code performance">
              <div className="code-funnel-stat">
                <span className="code-funnel-step">01</span>
                <span className="code-funnel-num">{formatNumber(redeemed)}</span>
                <span className="code-funnel-label">Code redemptions</span>
                <span className="code-funnel-sub">Entered your code</span>
              </div>
              <div className="code-funnel-connector" aria-label={`${trialPct}% started a trial`}>
                <span className="code-funnel-rate">{trialPct}%</span>
                <span className="code-funnel-connector-label">started a trial</span>
                <span className="code-funnel-arrow" aria-hidden="true">→</span>
              </div>
              <div className="code-funnel-stat">
                <span className="code-funnel-step">02</span>
                <span className="code-funnel-num">{formatNumber(trial)}</span>
                <span className="code-funnel-label">Premium trials</span>
                <span className="code-funnel-sub">Activated the free trial</span>
              </div>
              <div className="code-funnel-connector is-conversion" aria-label={`${paidPct}% became paid subscribers`}>
                <span className="code-funnel-rate">{paidPct}%</span>
                <span className="code-funnel-connector-label">became paid</span>
                <span className="code-funnel-arrow" aria-hidden="true">→</span>
              </div>
              <div className="code-funnel-stat is-paid">
                <span className="code-funnel-step">03</span>
                <span className="code-funnel-conversion-badge">Conversion</span>
                <span className="code-funnel-num">{formatNumber(paid)}</span>
                <span className="code-funnel-label">Paid subscriptions</span>
                <span className="code-funnel-sub">Continued after the trial</span>
              </div>
            </div>

            <p className="code-report-note">
              A conversion is counted when someone continues with a paid Premium subscription after their trial.
            </p>

            <div className="code-report-foot">
              <span>{redeemedRange
                ? `${code.firstRedeemedAt ? `First redeemed ${formatDate(code.firstRedeemedAt)}` : ""}${code.firstRedeemedAt && code.lastRedeemedAt ? " · " : ""}${code.lastRedeemedAt ? `Last ${formatDate(code.lastRedeemedAt)}` : ""}`
                : "No redemptions yet"}</span>
              <span>{validUntil ? `Valid until ${formatDate(validUntil)}` : "No end date"}</span>
            </div>
          </figure>

          <div className="code-admin">
            <div className="code-admin-head">
              <span className="code-field-label">Manage</span>
              <small>Not part of the shared report</small>
            </div>
            <div className="code-admin-grid">
              <label className="inline-edit-field">
                <span className="code-field-label">Creator</span>
                <div className="linked-creator-cell">
                  <input value={creatorDisplayName} onChange={(event) => setCreatorDisplayName(event.target.value)} />
                  <button type="button" className="secondary copy-button" onClick={() => onOpenCreator(code.creatorId)}>Open</button>
                </div>
              </label>
              <label className="inline-edit-field compact-inline-field">
                <span className="code-field-label">Premium days</span>
                <input inputMode="numeric" value={premiumDurationDays} onChange={(event) => setPremiumDurationDays(numericText(event.target.value))} />
              </label>
              <label className="inline-edit-field">
                <span className="code-field-label">Valid until</span>
                <input type="date" value={validUntil} onChange={(event) => setValidUntil(event.target.value)} />
              </label>
              <label className="inline-edit-field">
                <span className="code-field-label">Status</span>
                <select value={status} onChange={(event) => setStatus(event.target.value as CreatorCodeStatus)}>
                  <option value="active">active</option>
                  <option value="disabled">disabled</option>
                  <option value="expired">expired</option>
                </select>
              </label>
            </div>
            <div className="row-actions code-admin-actions">
              <button type="button" className="action-button" onClick={saveInlineEdits} disabled={loading || !toNullableNumber(premiumDurationDays)}>Save</button>
              <button type="button" className="secondary action-button" onClick={() => onPatch(code, { clearValidUntil: true })} disabled={loading || !code.validUntil} title="Remove the expiry date so this code never expires">Clear end date</button>
              <button type="button" className="danger action-button" onClick={() => onDelete(code)} disabled={loading || code.ongoingCount > 0} title={code.ongoingCount > 0 ? "Redeemed codes cannot be hard-deleted" : "Permanently delete code"}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function BulkEditBar({
  form,
  templates,
  loading,
  markedCount,
  visibleCount,
  loadedCount,
  onChange,
  onSelectVisible,
  onClearMarked,
  onArchiveMarked,
  onSendMarkedEmails,
  onSubmit,
}: {
  form: BulkEditForm;
  templates: MessageTemplate[];
  loading: boolean;
  markedCount: number;
  visibleCount: number;
  loadedCount: number;
  onChange: (form: BulkEditForm) => void;
  onSelectVisible: () => void;
  onClearMarked: () => void;
  onArchiveMarked: () => void;
  onSendMarkedEmails?: () => void;
  onSubmit: (event: FormEvent) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (markedCount > 0) setExpanded(true);
  }, [markedCount]);

  const hasCheckedField =
    (form.setFirstMessageDate && Boolean(form.firstMessageDate)) ||
    (form.setLastContactDate && Boolean(form.lastContactDate)) ||
    form.setResponseStatus ||
    form.setMessage;

  return (
    <details className="bulk-edit-disclosure" open={expanded} onToggle={(event) => setExpanded(event.currentTarget.open)}>
      <summary>
        <span className="disclosure-title">Bulk actions</span>
        <span className={`marked-count ${markedCount > 0 ? "active" : ""}`}>{markedCount} marked</span>
        <span className="disclosure-hint">Select rows in the table to edit them together</span>
        <span className="disclosure-chevron" aria-hidden="true">⌄</span>
      </summary>
      <form className="bulk-edit-bar" onSubmit={onSubmit}>
        <div className="bulk-scope">
          <span>Selection</span>
          <strong>{visibleCount} visible <small>· {loadedCount} loaded</small></strong>
          <div className="bulk-selection-actions">
            <button type="button" className="secondary compact-button" onClick={onSelectVisible} disabled={loading || visibleCount === 0}>Select visible</button>
            <button type="button" className="secondary compact-button" onClick={onClearMarked} disabled={loading || markedCount === 0}>Clear</button>
            {onSendMarkedEmails && <button type="button" className="compact-button" onClick={onSendMarkedEmails} disabled={loading || markedCount === 0}>Send marked (up to {MAX_EMAIL_SEND_BATCH_SIZE})</button>}
            <button type="button" className="danger compact-button" onClick={onArchiveMarked} disabled={loading || markedCount === 0}>Archive marked</button>
          </div>
        </div>

        <label className="bulk-check-field">
          <span>
            <input type="checkbox" checked={form.setFirstMessageDate} onChange={(event) => onChange({ ...form, setFirstMessageDate: event.target.checked })} />
            First date
          </span>
          <input type="date" value={form.firstMessageDate} disabled={!form.setFirstMessageDate} onChange={(event) => onChange({ ...form, firstMessageDate: event.target.value })} />
        </label>

        <label className="bulk-check-field">
          <span>
            <input type="checkbox" checked={form.setLastContactDate} onChange={(event) => onChange({ ...form, setLastContactDate: event.target.checked })} />
            Last date
          </span>
          <input type="date" value={form.lastContactDate} disabled={!form.setLastContactDate} onChange={(event) => onChange({ ...form, lastContactDate: event.target.value })} />
        </label>

        <label className="bulk-check-field">
          <span>
            <input type="checkbox" checked={form.setResponseStatus} onChange={(event) => onChange({ ...form, setResponseStatus: event.target.checked })} />
            Status
          </span>
          <select value={form.responseStatus} disabled={!form.setResponseStatus} onChange={(event) => onChange({ ...form, responseStatus: event.target.value as CreatorRow["responseStatus"] })}>
            <option value="Yes">Yes</option>
            <option value="No">No</option>
            <option value="Not Interested">Not Interested</option>
            <option value="Archived">Archived</option>
          </select>
        </label>

        <label className="bulk-check-field bulk-template-field">
          <span>
            <input type="checkbox" checked={form.setMessage} onChange={(event) => onChange({ ...form, setMessage: event.target.checked })} />
            DM template
          </span>
          <select value={form.messageTemplateId} disabled={!form.setMessage} onChange={(event) => onChange({ ...form, messageTemplateId: event.target.value })}>
            <option value="">Choose DM template</option>
            {templates.map((template) => <option key={template.id} value={template.id}>{template.name}{template.isActive ? " (active)" : ""}</option>)}
          </select>
        </label>

        <button type="submit" className="compact-button" disabled={loading || markedCount === 0 || !hasCheckedField}>Apply to marked</button>
      </form>
    </details>
  );
}

function TemplatesView({
  dmTemplates,
  emailTemplates,
  templateForms,
  loading,
  onFormChange,
  onSubmit,
  onEdit,
  onActivate,
  onDelete,
  onCancel,
}: {
  dmTemplates: MessageTemplate[];
  emailTemplates: MessageTemplate[];
  templateForms: TemplateForms;
  loading: boolean;
  onFormChange: (kind: TemplateKind, update: Partial<TemplateForm>) => void;
  onSubmit: (event: FormEvent, kind: TemplateKind) => void;
  onEdit: (template: MessageTemplate) => void;
  onActivate: (template: MessageTemplate) => void;
  onDelete: (template: MessageTemplate) => void;
  onCancel: (kind: TemplateKind) => void;
}) {
  return (
    <section className="dashboard-grid templates-view">
      <article className="panel templates-panel">
        <div className="panel-header">
          <div>
            <h2>Templates</h2>
            <p>Manage the DM templates for first outreach and email templates for follow-ups.</p>
          </div>
        </div>

        <div className="template-editor-grid">
          <TemplateEditor
            title="DM template"
            description="Used when sending messages in prospecting."
            form={templateForms.Dm}
            loading={loading}
            onChange={(update) => onFormChange("Dm", update)}
            onSubmit={(event) => onSubmit(event, "Dm")}
            onCancel={() => onCancel("Dm")}
          />
          <TemplateEditor
            title="Email template"
            description="Used when following up with creators who have not responded to DMs."
            form={templateForms.Email}
            loading={loading}
            onChange={(update) => onFormChange("Email", update)}
            onSubmit={(event) => onSubmit(event, "Email")}
            onCancel={() => onCancel("Email")}
          />
        </div>
      </article>

      <article className="panel template-library">
        <div className="panel-header compact">
          <div>
            <h2>Template library</h2>
            <p>Pick and maintain separate DM template and Email template sets.</p>
          </div>
        </div>
        <div className="template-library-grid">
          <TemplateLibrarySection
            title="DM templates"
            description="Active DM template is used for prospecting."
            templates={dmTemplates}
            emptyText="No DM templates yet. Create one to auto-fill new prospect messages."
            onEdit={onEdit}
            onActivate={onActivate}
            onDelete={onDelete}
          />
          <TemplateLibrarySection
            title="Email templates"
            description="Active email template is used for no-response follow-ups."
            templates={emailTemplates}
            emptyText="No email templates yet. Create one for follow-up messages."
            onEdit={onEdit}
            onActivate={onActivate}
            onDelete={onDelete}
          />
        </div>
      </article>
    </section>
  );
}

function TemplateEditor({
  title,
  description,
  form,
  loading,
  onChange,
  onSubmit,
  onCancel,
}: {
  title: string;
  description: string;
  form: TemplateForm;
  loading: boolean;
  onChange: (update: Partial<TemplateForm>) => void;
  onSubmit: (event: FormEvent) => void;
  onCancel: () => void;
}) {
  return (
    <section className="template-editor-card">
      <div className="template-kind-header">
        <div>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
        <span className="template-kind-badge">{form.kind === "Email" ? "Email" : "DM"}</span>
      </div>
      <form className="template-form" onSubmit={onSubmit}>
        <label>
          <span>Name</span>
          <input required value={form.name} onChange={(event) => onChange({ name: event.target.value })} placeholder={form.kind === "Email" ? "7 day email follow-up" : "v3 AI DM"} />
        </label>
        {form.kind === "Email" && (
          <label>
            <span>Subject</span>
            <input value={form.subject} onChange={(event) => onChange({ subject: event.target.value })} placeholder="Quick follow-up" />
          </label>
        )}
        <label>
          <span>{form.kind === "Email" ? "Email body" : "DM body"}</span>
          <textarea className="template-body-textarea" required value={form.body} onChange={(event) => onChange({ body: event.target.value })} rows={10} />
        </label>
        <label>
          <span>AI rules</span>
          <textarea value={form.generationRules} onChange={(event) => onChange({ generationRules: event.target.value })} rows={6} placeholder="Rules the agent must follow when generating personalized drafts." />
        </label>
        <label className="check-row">
          <input type="checkbox" checked={form.activate} onChange={(event) => onChange({ activate: event.target.checked })} />
          <span>Make active {form.kind === "Email" ? "email" : "DM"} template</span>
        </label>
        <div className="action-row">
          <button type="submit" disabled={loading}>{form.id ? "Save template" : "Create template"}</button>
          {form.id && <button type="button" className="secondary" onClick={onCancel}>Cancel edit</button>}
        </div>
      </form>
    </section>
  );
}

function TemplateLibrarySection({
  title,
  description,
  templates,
  emptyText,
  onEdit,
  onActivate,
  onDelete,
}: {
  title: string;
  description: string;
  templates: MessageTemplate[];
  emptyText: string;
  onEdit: (template: MessageTemplate) => void;
  onActivate: (template: MessageTemplate) => void;
  onDelete: (template: MessageTemplate) => void;
}) {
  return (
    <section className="template-library-section">
      <div className="template-kind-header compact">
        <div>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
      </div>
      <div className="template-list">
        {templates.map((template) => (
          <div className={`template-item ${template.isActive ? "active" : ""}`} key={template.id}>
            <div>
              <h3>{template.name}</h3>
              <span>{template.isActive ? "Active" : "Inactive"}</span>
            </div>
            {templateKind(template) === "Email" && template.subject?.trim() && (
              <p className="template-subject"><strong>Subject</strong>{template.subject}</p>
            )}
            <p>{template.body}</p>
            {template.generationRules && (
              <p className="template-rules"><strong>AI rules</strong>{template.generationRules}</p>
            )}
            <div className="action-row">
              <button type="button" className="secondary compact-button" onClick={() => onEdit(template)}>Edit</button>
              {!template.isActive && <button type="button" className="compact-button" onClick={() => onActivate(template)}>Activate</button>}
              <button type="button" className="danger compact-button" onClick={() => onDelete(template)}>Delete</button>
            </div>
          </div>
        ))}
        {templates.length === 0 && <p className="empty-copy">{emptyText}</p>}
      </div>
    </section>
  );
}

function TodoFilterPanel({
  filters,
  matchCount,
  onChange,
}: {
  filters: TodoFilters;
  matchCount: number;
  onChange: <Key extends keyof TodoFilters>(key: Key, value: TodoFilters[Key]) => void;
}) {
  const narrowingActive = filters.includeResponded || filters.includeHasEmail;

  return (
    <section className="todo-filter-panel" aria-label="Todo filters">
      <div className="todo-filter-summary">
        <span>Todo filter</span>
        <strong>
          {matchCount}
          <em>{matchCount === 1 ? "creator to follow up" : "creators to follow up"}</em>
        </strong>
        <small>No contact uses last contact date first, then first message date. Blank contact dates are excluded unless included below.</small>
      </div>

      <div className="todo-control-group todo-control-group--threshold">
        <span className="todo-control-label">Overdue threshold</span>
        <label className="todo-days-field">
          <span>No contact for at least</span>
          <input
            type="number"
            min="0"
            step="1"
            value={filters.daysWithoutContact}
            onChange={(event) => onChange("daysWithoutContact", numericText(event.target.value))}
          />
          <span>days</span>
        </label>
        <label className="todo-check-row">
          <input
            type="checkbox"
            checked={filters.includeNeverContacted}
            onChange={(event) => onChange("includeNeverContacted", event.target.checked)}
          />
          <span>Include blank contact dates</span>
        </label>
      </div>

      <div className="todo-control-group todo-control-group--narrow" data-active={narrowingActive}>
        <div className="todo-control-head">
          <span className="todo-control-label">Narrow by</span>
          <label className="todo-mode-field" aria-disabled={!narrowingActive}>
            <span>Match</span>
            <select
              value={filters.contactabilityMode}
              disabled={!narrowingActive}
              onChange={(event) => onChange("contactabilityMode", event.target.value as TodoFilters["contactabilityMode"])}
            >
              <option value="any">any</option>
              <option value="all">all</option>
            </select>
          </label>
        </div>
        <div className="todo-toggle-row">
          <label className="todo-check-row" data-on={filters.includeResponded}>
            <input
              type="checkbox"
              checked={filters.includeResponded}
              onChange={(event) => onChange("includeResponded", event.target.checked)}
            />
            <span>Responded yes</span>
          </label>
          <label className="todo-check-row" data-on={filters.includeHasEmail}>
            <input
              type="checkbox"
              checked={filters.includeHasEmail}
              onChange={(event) => onChange("includeHasEmail", event.target.checked)}
            />
            <span>Has email</span>
          </label>
        </div>
      </div>
    </section>
  );
}

function CreatorTable({
  creators,
  emptyText,
  selectedCreatorId,
  markedCreatorIds,
  onSelect,
  onToggleMark,
  onArchive,
  onRestore,
  onCopyText,
  filters,
  onFilterChange,
  searchQuery,
  onSearchChange,
  codeByCreatorId,
  emailTemplates,
  expandedCreatorIds,
  onToggleExpand,
  onChangeCreator,
  onSaveCreator,
  onSendEmailFollowUp,
}: {
  creators: CreatorRow[];
  emptyText: string;
  selectedCreatorId: string | null;
  markedCreatorIds?: Set<string>;
  onSelect: (id: string) => void;
  onToggleMark?: (id: string) => void;
  onArchive?: (creator: CreatorRow) => void;
  onRestore?: (creator: CreatorRow) => void;
  onCopyText?: (text: string | null | undefined, label: string) => void;
  filters?: CreatorFilters;
  onFilterChange?: <Key extends keyof CreatorFilters>(key: Key, value: CreatorFilters[Key]) => void;
  searchQuery?: string;
  onSearchChange?: (value: string) => void;
  codeByCreatorId?: Map<string, string>;
  emailTemplates?: MessageTemplate[];
  expandedCreatorIds?: Set<string>;
  onToggleExpand?: (id: string) => void;
  onChangeCreator?: (id: string, update: Partial<CreatorRow>) => void;
  onSaveCreator?: (creator: CreatorRow) => void;
  onSendEmailFollowUp?: (creator: CreatorRow) => void;
}) {
  const showColumnFilters = Boolean(filters && onFilterChange);
  const showSearchFilter = !showColumnFilters && typeof searchQuery === "string" && Boolean(onSearchChange);
  const showMarkers = Boolean(markedCreatorIds && onToggleMark);
  const canExpandRows = Boolean(emailTemplates && expandedCreatorIds && onToggleExpand && onChangeCreator && onSaveCreator);
  const activeEmailTemplate = emailTemplates?.find((template) => template.isActive) ?? null;
  const tableFilters = filters ?? emptyFilters;
  const handleFilterChange = onFilterChange ?? (() => undefined);
  const handleSort = (field: Exclude<ReachedOutSortField, "notInterested">) => {
    if (!onFilterChange) return;

    if (tableFilters.sortField === field) {
      onFilterChange("sortDirection", tableFilters.sortDirection === "asc" ? "desc" : "asc");
      return;
    }

    onFilterChange("sortField", field);
    onFilterChange("sortDirection", "asc");
  };

  return (
    <div className="table-wrap">
      <table>
        <colgroup>
          <col className="col-row" />
          <col className="col-creator" />
          <col className="col-platform" />
          <col className="col-followers" />
          <col className="col-message" />
          <col className="col-date" />
          <col className="col-date" />
          <col className="col-responded" />
          <col className="col-email" />
          <col className="col-threads" />
          <col className="col-code" />
          <col className="col-stage" />
          <col className="col-action" />
        </colgroup>
        <thead>
          {showColumnFilters && (
            <tr className="filter-row">
              <th className="row-number" aria-hidden="true"></th>
              <th>
                <label>
                  <span>Creator</span>
                  <input aria-label="Filter creator, profile, email, or Threads" placeholder="Handle, profile, email, Threads" value={tableFilters.query} onChange={(event) => handleFilterChange("query", event.target.value)} />
                </label>
              </th>
              <th>
                <label>
                  <span>Platform</span>
                  <select aria-label="Filter platform" value={tableFilters.platform} onChange={(event) => handleFilterChange("platform", event.target.value as PlatformFilter)}>
                    <option value="all">All</option>
                    <option value="Instagram">Instagram</option>
                    <option value="TikTok">TikTok</option>
                  </select>
                </label>
              </th>
              <th aria-hidden="true"></th>
              <th>
                <label>
                  <span>Message</span>
                  <input aria-label="Filter message version" placeholder="Version" value={tableFilters.messageVersion} onChange={(event) => handleFilterChange("messageVersion", event.target.value)} />
                </label>
              </th>
              <th>
                <label>
                  <span>First</span>
                  <input aria-label="Filter first message date" placeholder="YYYY-MM" value={tableFilters.firstDate} onChange={(event) => handleFilterChange("firstDate", event.target.value)} />
                </label>
              </th>
              <th>
                <label>
                  <span>Last</span>
                  <input aria-label="Filter last contact date" placeholder="YYYY-MM" value={tableFilters.lastDate} onChange={(event) => handleFilterChange("lastDate", event.target.value)} />
                </label>
              </th>
              <th>
                <label>
                  <span>Status</span>
                  <select aria-label="Filter status" value={tableFilters.responseStatus} onChange={(event) => handleFilterChange("responseStatus", event.target.value as ResponseFilter)}>
                    <option value="all">All</option>
                    <option value="Yes">Yes</option>
                    <option value="No">No</option>
                    <option value="Not Interested">Not Interested</option>
                    <option value="Archived">Archived</option>
                  </select>
                </label>
              </th>
              <th>
                <label>
                  <span>Email</span>
                  <select aria-label="Filter email presence" value={tableFilters.emailPresence} onChange={(event) => handleFilterChange("emailPresence", event.target.value as EmailFilter)}>
                    <option value="all">All</option>
                    <option value="has">Has email</option>
                    <option value="missing">Missing</option>
                  </select>
                </label>
              </th>
              <th aria-hidden="true"></th>
              <th>
                <label>
                  <span>Code</span>
                  <input aria-label="Filter code" placeholder="Code" value={tableFilters.code} onChange={(event) => handleFilterChange("code", event.target.value)} />
                </label>
              </th>
              <th aria-hidden="true"></th>
              <th aria-hidden="true"></th>
            </tr>
          )}
          {showSearchFilter && (
            <tr className="filter-row">
              <th className="row-number" aria-hidden="true"></th>
              <th>
                <label>
                  <span>Creator</span>
                  <input
                    aria-label="Filter creator, profile, email, or Threads"
                    placeholder="Handle, profile, email, Threads"
                    value={searchQuery}
                    onChange={(event) => onSearchChange?.(event.target.value)}
                  />
                </label>
              </th>
              <th aria-hidden="true"></th>
              <th aria-hidden="true"></th>
              <th aria-hidden="true"></th>
              <th aria-hidden="true"></th>
              <th aria-hidden="true"></th>
              <th aria-hidden="true"></th>
              <th aria-hidden="true"></th>
              <th aria-hidden="true"></th>
              <th aria-hidden="true"></th>
              <th aria-hidden="true"></th>
              <th aria-hidden="true"></th>
            </tr>
          )}
          <tr>
            <th className="row-number">#</th>
            <th>Creator</th>
            <th>Platform</th>
            <th>
              {showColumnFilters ? (
                <SortHeader
                  label="Followers"
                  field="followers"
                  activeField={tableFilters.sortField}
                  direction={tableFilters.sortDirection}
                  onSort={handleSort}
                />
              ) : "Followers"}
            </th>
            <th>Message</th>
            <th>
              {showColumnFilters ? (
                <SortHeader
                  label="First"
                  field="firstDate"
                  activeField={tableFilters.sortField}
                  direction={tableFilters.sortDirection}
                  onSort={handleSort}
                />
              ) : "First"}
            </th>
            <th>
              {showColumnFilters ? (
                <SortHeader
                  label="Last"
                  field="lastDate"
                  activeField={tableFilters.sortField}
                  direction={tableFilters.sortDirection}
                  onSort={handleSort}
                />
              ) : "Last"}
            </th>
            <th>Status</th>
            <th>Email</th>
            <th>Threads</th>
            <th>Code</th>
            <th>Stage</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {creators.length === 0 ? (
            <tr><td colSpan={13}>{emptyText}</td></tr>
          ) : creators.map((creator, index) => {
            const emailDraftCreator = applyActiveEmailTemplateDefaults(creator, activeEmailTemplate) ?? creator;
            const isMarked = markedCreatorIds?.has(creator.id) ?? false;
            const isExpanded = expandedCreatorIds?.has(creator.id) ?? false;
            const creatorCode = displayCreatorCode(creator, codeByCreatorId);
            const rowClassName = [
              selectedCreatorId === creator.id ? "selected-row" : "",
              isMarked ? "marked-row" : "",
              canExpandRows ? "todo-click-row" : "",
              isExpanded ? "expanded" : "",
            ].filter(Boolean).join(" ");
            const toggleFromRow = () => onToggleExpand?.(creator.id);
            const handleRowClick = (event: ReactMouseEvent<HTMLTableRowElement>) => {
              if (!canExpandRows || shouldIgnoreRowToggle(event.target)) return;
              toggleFromRow();
            };
            const handleRowKeyDown = (event: ReactKeyboardEvent<HTMLTableRowElement>) => {
              if (!canExpandRows || shouldIgnoreRowToggle(event.target)) return;
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              toggleFromRow();
            };

            return (
            <Fragment key={`${creator.channel}-${creator.profileUrl}`}>
            <tr
              className={rowClassName}
              role={canExpandRows ? "button" : undefined}
              tabIndex={canExpandRows ? 0 : undefined}
              aria-expanded={canExpandRows ? isExpanded : undefined}
              onClick={handleRowClick}
              onKeyDown={handleRowKeyDown}
            >
              <td className="row-number">{index + 1}</td>
              <td>
                <div className="creator-cell">
                  {canExpandRows && (
                    <span className="todo-expand-cue" aria-hidden="true">{isExpanded ? "-" : "+"}</span>
                  )}
                  <strong className="creator-handle" title={creator.profileUrl}>{creator.handle ?? creator.profileUrl}</strong>
                  <a className="profile-icon" href={creator.profileUrl} target="_blank" rel="noreferrer" aria-label={`Open ${creator.handle ?? "creator"} profile`} title="Open profile" onClick={(event) => event.stopPropagation()}>↗</a>
                </div>
              </td>
              <td><span className={`platform-pill ${creator.channel === 2 ? "tiktok" : "instagram"}`}>{channelName(creator.channel)}</span></td>
              <td>{creator.followers?.toLocaleString() ?? ""}</td>
              <td className="truncate" title={creator.messageVersion ?? ""}>{creator.messageVersion ?? ""}</td>
              <td className="date-cell" title={creator.firstMessageDate ?? ""}>{creator.firstMessageDate ?? ""}</td>
              <td className="date-cell" title={creator.lastContactDate ?? ""}>{creator.lastContactDate ?? ""}</td>
              <td><ResponseBadge value={creator.responseStatus} /></td>
              <td>
                <div className="copy-cell">
                  <span className="truncate" title={creator.email ?? ""}>{creator.email ?? ""}</span>
                  {creator.email && (
                    <button
                      type="button"
                      className="secondary copy-button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onCopyText?.(creator.email, "Email");
                      }}
                      title="Copy email"
                      aria-label={`Copy email for ${creator.handle ?? "creator"}`}
                    >
                      Copy
                    </button>
                  )}
                </div>
              </td>
              <td className="truncate" title={creator.threadsUrl ?? ""}>
                {creator.threadsUrl ? <a href={creator.threadsUrl} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>Threads</a> : ""}
              </td>
              <td className="truncate" title={creatorCode}>{creatorCode}</td>
              <td><StageBadge stage={creator.currentStage ?? "No redemptions"} /></td>
              <td>
                <div className="row-actions">
                  {showMarkers && (
                    <button
                      type="button"
                      className={`secondary action-button mark-button ${isMarked ? "active" : ""}`}
                      aria-pressed={isMarked}
                      onClick={(event) => {
                        event.stopPropagation();
                        onToggleMark?.(creator.id);
                      }}
                      title={isMarked ? "Unmark creator for bulk edit" : "Mark creator for bulk edit"}
                    >
                      {isMarked ? "Marked" : "Mark"}
                    </button>
                  )}
                  <button
                    type="button"
                    className="secondary action-button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onSelect(creator.id);
                    }}
                    title="Edit creator"
                  >
                    Edit
                  </button>
                  {onArchive && creator.responseStatus !== "Archived" && (
                    <button
                      type="button"
                      className="secondary danger action-button archive-button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onArchive(creator);
                      }}
                      title="Archive creator"
                    >
                      Archive
                    </button>
                  )}
                  {onRestore && creator.responseStatus === "Archived" && (
                    <button
                      type="button"
                      className="secondary action-button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onRestore(creator);
                      }}
                      title="Restore creator to Reached Out"
                    >
                      Restore
                    </button>
                  )}
                </div>
              </td>
            </tr>
            {canExpandRows && isExpanded && (
              <tr className="todo-expanded-row">
                <td colSpan={13}>
                  <TodoEmailFollowupPanel
                    creator={emailDraftCreator}
                    templates={emailTemplates ?? []}
                    onChange={(update) => onChangeCreator?.(creator.id, preserveEffectiveEmailDraft(emailDraftCreator, update))}
                    onSave={() => onSaveCreator?.(emailDraftCreator)}
                    onCopyDraft={() => onCopyText?.(emailDraftCreator.emailBody, "Personalized email")}
                    onSend={() => onSendEmailFollowUp?.(emailDraftCreator)}
                  />
                </td>
              </tr>
            )}
            </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SortHeader({
  label,
  field,
  activeField,
  direction,
  onSort,
}: {
  label: string;
  field: Exclude<ReachedOutSortField, "notInterested">;
  activeField: ReachedOutSortField;
  direction: SortDirection;
  onSort: (field: Exclude<ReachedOutSortField, "notInterested">) => void;
}) {
  const isActive = activeField === field;
  const arrow = isActive ? (direction === "asc" ? "↑" : "↓") : "↕";

  return (
    <button
      type="button"
      className={`sort-header ${isActive ? "active" : ""}`}
      onClick={() => onSort(field)}
      aria-label={`Sort by ${label.toLowerCase()}${isActive ? ` ${direction === "asc" ? "ascending" : "descending"}` : ""}`}
      title={`Sort by ${label.toLowerCase()}`}
    >
      <span>{label}</span>
      <span aria-hidden="true">{arrow}</span>
    </button>
  );
}

function TodoEmailFollowupPanel({
  creator,
  templates,
  onChange,
  onSave,
  onCopyDraft,
  onSend,
}: {
  creator: CreatorRow;
  templates: MessageTemplate[];
  onChange: (update: Partial<CreatorRow>) => void;
  onSave: () => void;
  onCopyDraft: () => void;
  onSend: () => void;
}) {
  const hasEmail = Boolean(creator.email?.trim());

  return (
    <div className="todo-email-panel">
      <div className="todo-email-grid">
        <label>
          <span>Email</span>
          <input
            value={creator.email ?? ""}
            onChange={(event) => onChange({ email: event.target.value })}
            aria-describedby={!hasEmail ? `email-followup-${creator.id}` : undefined}
          />
          {!hasEmail && (
            <small id={`email-followup-${creator.id}`} className="field-feedback error">
              Email follow-up needs an email address.
            </small>
          )}
        </label>
        <label>
          <span>Email template</span>
          <select
            value={creator.emailTemplateId ?? ""}
            onChange={(event) => onChange(emailTemplateSelectionUpdate(creator, event.target.value, templates))}
          >
            <option value="">No email template</option>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>{template.name}{template.isActive ? " (active)" : ""}</option>
            ))}
          </select>
        </label>
        <label className="todo-email-subject-field">
          <span>Email subject</span>
          <input
            value={creator.emailSubject ?? ""}
            onChange={(event) => onChange({ emailSubject: event.target.value })}
            placeholder="Personalized follow-up subject"
          />
        </label>
      </div>

      <label className="textarea-field message-copy-field">
        <span>Personalized email</span>
        <button
          type="button"
          className="secondary copy-button message-copy-button"
          onClick={onCopyDraft}
          disabled={!creator.emailBody?.trim()}
          title="Copy personalized email"
        >
          Copy
        </button>
        <textarea
          value={creator.emailBody ?? ""}
          rows={7}
          onChange={(event) => onChange({ emailBody: event.target.value })}
        />
      </label>

      <div className="action-row todo-email-actions">
        <button type="button" className="secondary compact-button" onClick={onSave} disabled={!hasEmail}>Save email follow-up</button>
        <button type="button" className="compact-button" onClick={onSend} disabled={!hasEmail || !creator.emailSubject?.trim() || !creator.emailBody?.trim()}>Send email</button>
      </div>
    </div>
  );
}

function PendingCreatorCard({
  creator,
  index,
  templates,
  onChange,
  onSave,
  onComplete,
  onDelete,
  onCopyMessage,
}: {
  creator: CreatorRow;
  index: number;
  templates: MessageTemplate[];
  onChange: (update: Partial<CreatorRow>) => void;
  onSave: () => void;
  onComplete: () => void;
  onDelete: () => void;
  onCopyMessage: () => void;
}) {
  return (
    <div className={`pending-card${creator.isReadyForAction ? " ready-for-action" : ""}`}>
      <div className="pending-heading">
        <div>
          <strong><span className="queue-number">{index + 1}</span>{creator.handle ?? creator.profileUrl}</strong>
          <span>{creatorPlatformName(creator)}</span>
        </div>
        <div className="pending-heading-actions">
          <a className="profile-icon" href={creator.profileUrl} target="_blank" rel="noreferrer" aria-label={`Open ${creator.handle ?? "creator"} profile`} title="Open profile">↗</a>
        </div>
      </div>

      <div className="edit-grid">
        <label>
          <span>Followers</span>
          <input inputMode="numeric" value={creator.followers ?? ""} onChange={(event) => onChange({ followers: toNullableNumber(event.target.value) })} />
        </label>
        <label>
          <span>First date</span>
          <input type="date" value={creator.firstMessageDate ?? today()} onChange={(event) => onChange({ firstMessageDate: event.target.value })} />
        </label>
        <label>
          <span>Email</span>
          <input value={creator.email ?? ""} onChange={(event) => onChange({ email: event.target.value })} />
        </label>
        <label>
          <span>Threads</span>
          <input value={creator.threadsUrl ?? ""} onChange={(event) => onChange({ threadsUrl: event.target.value })} />
        </label>
        <label>
          <span>DM template</span>
          <select value={creator.messageTemplateId ?? ""} onChange={(event) => {
            onChange(templateSelectionUpdate(creator, event.target.value, templates));
          }}>
            <option value="">No DM template</option>
            {templates.map((template) => <option key={template.id} value={template.id}>{template.name}{template.isActive ? " (active)" : ""}</option>)}
          </select>
        </label>
      </div>

      <label className="textarea-field message-copy-field">
        <span>Personalized message</span>
        <button
          type="button"
          className="secondary copy-button message-copy-button"
          onClick={onCopyMessage}
          disabled={!creator.messageBody?.trim()}
          title="Copy personalized message"
        >
          Copy
        </button>
        <textarea value={creator.messageBody ?? ""} rows={6} onChange={(event) => onChange({ messageBody: event.target.value })} />
      </label>

      <div className="action-row pending-action-row">
        <div className="pending-primary-actions">
          <button type="button" className="secondary compact-button" onClick={onSave}>Save draft</button>
          <button type="button" className="compact-button" onClick={onComplete}>Mark complete</button>
        </div>
        <button type="button" className="danger secondary compact-button pending-remove-button" onClick={onDelete}>Remove</button>
      </div>
    </div>
  );
}

const CreatorEditPanel = forwardRef<HTMLElement, {
  creator: CreatorRow;
  dmTemplates: MessageTemplate[];
  emailTemplates: MessageTemplate[];
  creatorCode?: string;
  onChange: (update: Partial<CreatorRow>) => void;
  onSave: () => void;
}>(function CreatorEditPanel({
  creator,
  dmTemplates,
  emailTemplates,
  creatorCode,
  onChange,
  onSave,
}, ref) {
  return (
    <article className="edit-panel" ref={ref}>
      <div className="panel-header compact">
        <div>
          <h2>Edit creator</h2>
          <p>{creator.handle ?? creator.profileUrl}</p>
        </div>
        <ResponseBadge value={creator.responseStatus} />
      </div>
      <div className="edit-grid">
        <label>
          <span>Followers</span>
          <input inputMode="numeric" value={creator.followers ?? ""} onChange={(event) => onChange({ followers: toNullableNumber(event.target.value) })} />
        </label>
        <label>
          <span>Email</span>
          <input value={creator.email ?? ""} onChange={(event) => onChange({ email: event.target.value })} />
        </label>
        <label>
          <span>Threads</span>
          <input value={creator.threadsUrl ?? ""} onChange={(event) => onChange({ threadsUrl: event.target.value })} />
        </label>
        <label>
          <span>Code</span>
          <input value={creatorCode ?? ""} readOnly disabled title="Codes are managed in the Creator Codes tab" placeholder="—" />
        </label>
        <label>
          <span>Status</span>
          <select value={creator.responseStatus} onChange={(event) => onChange({ responseStatus: event.target.value as CreatorRow["responseStatus"] })}>
            <option value="Yes">Yes</option>
            <option value="No">No</option>
            <option value="Not Interested">Not Interested</option>
            <option value="Archived">Archived</option>
          </select>
        </label>
        <label>
          <span>First date</span>
          <input type="date" value={creator.firstMessageDate ?? ""} onChange={(event) => onChange({ firstMessageDate: event.target.value })} />
        </label>
        <label>
          <span>Last date</span>
          <input type="date" value={creator.lastContactDate ?? ""} onChange={(event) => onChange({ lastContactDate: event.target.value })} />
        </label>
      </div>
      <div className="creator-message-grid">
        <section className="creator-message-box">
          <div className="creator-message-header">
            <h3>DM draft</h3>
            <span>Prospecting message</span>
          </div>
          <label>
            <span>DM template</span>
            <select value={creator.messageTemplateId ?? ""} onChange={(event) => {
              onChange(templateSelectionUpdate(creator, event.target.value, dmTemplates));
            }}>
              <option value="">No DM template</option>
              {dmTemplates.map((template) => <option key={template.id} value={template.id}>{template.name}{template.isActive ? " (active)" : ""}</option>)}
            </select>
          </label>
          <label className="textarea-field">
            <span>Personalized DM</span>
            <textarea value={creator.messageBody ?? ""} rows={7} onChange={(event) => onChange({ messageBody: event.target.value })} />
          </label>
        </section>

        <section className="creator-message-box">
          <div className="creator-message-header">
            <h3>Email draft</h3>
            <span>No-response follow-up</span>
          </div>
          <label>
            <span>Email template</span>
            <select value={creator.emailTemplateId ?? ""} onChange={(event) => {
              onChange(emailTemplateSelectionUpdate(creator, event.target.value, emailTemplates));
            }}>
              <option value="">No email template</option>
              {emailTemplates.map((template) => <option key={template.id} value={template.id}>{template.name}{template.isActive ? " (active)" : ""}</option>)}
            </select>
          </label>
          <label>
            <span>Email subject</span>
            <input value={creator.emailSubject ?? ""} onChange={(event) => onChange({ emailSubject: event.target.value })} placeholder="Personalized follow-up subject" />
          </label>
          <label className="textarea-field">
            <span>Personalized email</span>
            <textarea value={creator.emailBody ?? ""} rows={7} onChange={(event) => onChange({ emailBody: event.target.value })} />
          </label>
        </section>
      </div>
      <div className="action-row">
        <button type="button" onClick={onSave}>Save changes</button>
      </div>
    </article>
  );
});

function ResponseBadge({ value }: { value: CreatorRow["responseStatus"] }) {
  return <span className={`response-badge ${value === "Not Interested" ? "not-interested" : value.toLowerCase()}`}>{value}</span>;
}

function StageBadge({ stage, title }: { stage?: CreatorStage | null; title?: string }) {
  const canonicalStage = stage ?? "No redemptions";
  return <span className={`stage-badge ${stageClass(canonicalStage)}`} title={title}>{stageLabel(canonicalStage)}</span>;
}

const VIEW_ITEMS: ViewName[] = ["reachedOut", "prospecting", "todo", "templates", "creatorCodes"];

function ViewTabs({ view, onSelect }: { view: ViewName; onSelect: (view: ViewName) => void }) {
  const navRef = useRef<HTMLElement | null>(null);
  const buttonRefs = useRef<Partial<Record<ViewName, HTMLButtonElement | null>>>({});
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const measure = () => {
      const nav = navRef.current;
      const button = buttonRefs.current[view];
      if (!nav || !button) return;
      const navRect = nav.getBoundingClientRect();
      const buttonRect = button.getBoundingClientRect();
      setIndicator({ left: buttonRect.left - navRect.left, width: buttonRect.width });
    };

    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [view]);

  return (
    <nav className="view-tabs" aria-label="Dashboard views" ref={navRef}>
      {indicator && (
        <span
          className="view-tabs-indicator"
          aria-hidden="true"
          style={{ transform: `translateX(${indicator.left}px)`, width: indicator.width }}
        />
      )}
      {VIEW_ITEMS.map((item) => (
        <button
          key={item}
          type="button"
          ref={(element) => {
            buttonRefs.current[item] = element;
          }}
          className={`tab ${view === item ? "active" : ""}`}
          aria-current={view === item ? "page" : undefined}
          onClick={() => onSelect(item)}
        >
          {labelForView(item)}
        </button>
      ))}
    </nav>
  );
}

function PlatformToggle({ value, onChange }: { value: PlatformFilter; onChange: (value: PlatformFilter) => void }) {
  const options: PlatformFilter[] = ["all", "Instagram", "TikTok"];

  return (
    <div className="platform-toggle" role="group" aria-label="Filter prospects by platform">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          className={value === option ? "active" : ""}
          aria-pressed={value === option}
          onClick={() => onChange(option)}
        >
          {option === "all" ? "All" : option}
        </button>
      ))}
    </div>
  );
}

function ProspectReadinessToggle({ value, onChange }: { value: ProspectReadinessFilter; onChange: (value: ProspectReadinessFilter) => void }) {
  const options: ProspectReadinessFilter[] = ["queued", "ready"];

  return (
    <div className="platform-toggle readiness-toggle" role="group" aria-label="Filter prospects by readiness">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          className={value === option ? "active" : ""}
          aria-pressed={value === option}
          onClick={() => onChange(option)}
        >
          {option === "queued" ? "Queued" : "Ready"}
        </button>
      ))}
    </div>
  );
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handler = () => setReduced(query.matches);
    query.addEventListener("change", handler);
    return () => query.removeEventListener("change", handler);
  }, []);

  return reduced;
}

function AnimatedNumber({ value }: { value: string }) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const fromRef = useRef(0);
  const reduced = useReducedMotion();
  const hasPercentSuffix = value.trim().endsWith("%");
  const target = useMemo(() => {
    const parsed = Number(value.replace(/[^\d.-]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }, [value]);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    if (target === null) {
      element.textContent = value;
      return;
    }

    const from = fromRef.current;
    if (reduced || from === target) {
      element.textContent = formatAnimatedNumberValue(target, hasPercentSuffix);
      fromRef.current = target;
      return;
    }

    const duration = 650;
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic — responsive jump, gentle settle
      element.textContent = formatAnimatedNumberValue(Math.round(from + (target - from) * eased), hasPercentSuffix);
      if (progress < 1) {
        frame = requestAnimationFrame(tick);
      } else {
        fromRef.current = target;
      }
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, value, reduced, hasPercentSuffix]);

  return (
    <span ref={ref} className="animated-number">
      {target === null ? value : formatAnimatedNumberValue(target, hasPercentSuffix)}
    </span>
  );
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      cache: init?.cache ?? "no-store",
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
  } catch {
    throw new Error(`Could not reach the API at ${API_BASE}. Restart the API and check CORS/local port settings.`);
  }

  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`.trim();
    try {
      const body = (await response.json()) as { message?: string; title?: string; detail?: string; errors?: Record<string, string[]> };
      const validationErrors = body.errors ? Object.values(body.errors).flat().join(" ") : "";
      detail = body.message || body.detail || validationErrors || body.title || detail;
    } catch {
      // Keep status text.
    }
    throw new Error(detail || "Request failed");
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

function normalizeDailyOutreachCounts(data: DailyOutreachCountsResponse, requestedDate: string): DailyOutreachCounts {
  return {
    date: requestedDate,
    instagram: toCount(data.instagram ?? data.Instagram),
    tikTok: toCount(data.tikTok ?? data.TikTok ?? data.tiktok),
  };
}

function toCount(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function sortReachedOutCreators(creators: CreatorRow[], sortField: ReachedOutSortField, direction: SortDirection) {
  return creators
    .map((creator, index) => ({ creator, index }))
    .sort((a, b) => {
      let result = 0;

      if (sortField === "followers") {
        result = compareNullableNumbers(a.creator.followers, b.creator.followers, direction);
      } else if (sortField === "firstDate") {
        result = compareNullableNumbers(parseIsoDateValue(a.creator.firstMessageDate), parseIsoDateValue(b.creator.firstMessageDate), direction);
      } else if (sortField === "lastDate") {
        result = compareNullableNumbers(parseIsoDateValue(a.creator.lastContactDate), parseIsoDateValue(b.creator.lastContactDate), direction);
      } else {
        result = Number(b.creator.responseStatus === "Not Interested") - Number(a.creator.responseStatus === "Not Interested");
      }

      return result || a.index - b.index;
    })
    .map((item) => item.creator);
}

function compareNullableNumbers(a: number | null | undefined, b: number | null | undefined, direction: SortDirection) {
  const aMissing = typeof a !== "number" || !Number.isFinite(a);
  const bMissing = typeof b !== "number" || !Number.isFinite(b);

  if (aMissing && bMissing) return 0;
  if (aMissing) return 1;
  if (bMissing) return -1;
  if (a === b) return 0;

  return direction === "asc" ? a - b : b - a;
}

function parseIsoDateValue(value?: string | null) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? "");
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const timestamp = Date.UTC(year, month - 1, day);
  const parsed = new Date(timestamp);

  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
    return null;
  }

  return timestamp;
}

function workflowPayload(creator: CreatorRow) {
  return {
    email: emptyToNull(creator.email),
    threadsUrl: creator.threadsUrl?.trim() ?? "",
    followers: creator.followers ?? null,
    code: emptyToNull(creator.code),
    messageVersion: emptyToNull(creator.messageVersion),
    messageTemplateId: creator.messageTemplateId ?? null,
    messageBody: emptyToNull(creator.messageBody),
    emailTemplateId: creator.emailTemplateId ?? null,
    emailSubject: emptyToNull(creator.emailSubject),
    emailBody: emptyToNull(creator.emailBody),
    responseStatus: creator.responseStatus,
    firstMessageDate: emptyToNull(creator.firstMessageDate),
    secondMessageDate: emptyToNull(creator.secondMessageDate),
    lastContactDate: emptyToNull(creator.lastContactDate),
    resumeContact: creator.resumeContact ?? null,
  };
}

function templateSelectionUpdate(creator: CreatorRow, templateId: string, templates: MessageTemplate[]): Partial<CreatorRow> {
  const selectedTemplate = templates.find((item) => item.id === templateId) ?? null;
  const previousTemplate = templates.find((item) => item.id === creator.messageTemplateId) ?? null;
  const update: Partial<CreatorRow> = {
    messageTemplateId: templateId || null,
    messageVersion: selectedTemplate?.name ?? creator.messageVersion,
  };

  if (selectedTemplate && canReplaceDraftMessage(creator.messageBody, previousTemplate)) {
    update.messageBody = selectedTemplate.body;
  }

  return update;
}

function emailTemplateSelectionUpdate(creator: CreatorRow, templateId: string, templates: MessageTemplate[]): Partial<CreatorRow> {
  const selectedTemplate = templates.find((item) => item.id === templateId) ?? null;
  const previousTemplate = templates.find((item) => item.id === creator.emailTemplateId) ?? null;
  const update: Partial<CreatorRow> = {
    emailTemplateId: templateId || null,
  };

  if (selectedTemplate && canReplaceDraftSubject(creator.emailSubject, previousTemplate)) {
    update.emailSubject = selectedTemplate.subject ?? null;
  }

  if (selectedTemplate && canReplaceDraftMessage(creator.emailBody, previousTemplate)) {
    update.emailBody = selectedTemplate.body;
  }

  return update;
}

function applyActiveEmailTemplateDefaults(creator: CreatorRow | null, activeEmailTemplate: MessageTemplate | null): CreatorRow | null {
  if (!creator || !activeEmailTemplate || hasEmailFollowupDraft(creator)) {
    return creator;
  }

  return {
    ...creator,
    emailTemplateId: activeEmailTemplate.id,
    emailSubject: activeEmailTemplate.subject ?? null,
    emailBody: activeEmailTemplate.body,
  };
}

function preserveEffectiveEmailDraft(creator: CreatorRow, update: Partial<CreatorRow>): Partial<CreatorRow> {
  return {
    emailTemplateId: creator.emailTemplateId ?? null,
    emailSubject: creator.emailSubject ?? null,
    emailBody: creator.emailBody ?? null,
    ...update,
  };
}

function hasEmailFollowupDraft(creator: CreatorRow) {
  return Boolean(
    creator.emailTemplateId ||
    creator.emailSubject?.trim() ||
    creator.emailBody?.trim() ||
    creator.emailMessageSubject?.trim() ||
    creator.emailMessageBody?.trim(),
  );
}

function canReplaceDraftMessage(messageBody: string | null | undefined, previousTemplate: MessageTemplate | null) {
  if (!messageBody?.trim()) {
    return true;
  }

  const cleaned = messageBody.trim();
  if (cleaned === LEGACY_DEFAULT_MESSAGE_BODY) {
    return true;
  }

  return !!previousTemplate?.body.trim() && cleaned === previousTemplate.body.trim();
}

function canReplaceDraftSubject(subject: string | null | undefined, previousTemplate: MessageTemplate | null) {
  if (!subject?.trim()) {
    return true;
  }

  return !!previousTemplate?.subject?.trim() && subject.trim() === previousTemplate.subject.trim();
}

function shouldIgnoreRowToggle(target: EventTarget | null) {
  return target instanceof HTMLElement && Boolean(target.closest("a, button, input, select, textarea, label"));
}

function normalizeCreatorRow(creator: CreatorRow): CreatorRow {
  return {
    ...creator,
    emailSubject: creator.emailSubject ?? creator.emailMessageSubject ?? null,
    emailBody: creator.emailBody ?? creator.emailMessageBody ?? null,
  };
}

function displayCreatorCode(creator: CreatorRow, codeByCreatorId?: Map<string, string>) {
  return codeByCreatorId?.get(creator.id.toLowerCase()) ?? creator.code?.trim() ?? "";
}

function creatorMatchesFilters(creator: CreatorRow, filters: CreatorFilters) {
  if (!creatorMatchesSearch(creator, filters.query)) {
    return false;
  }

  if (filters.responseStatus === "all" && creator.responseStatus === "Archived") {
    return false;
  }

  if (filters.platform !== "all" && channelName(creator.channel) !== filters.platform) {
    return false;
  }

  if (filters.responseStatus !== "all" && creator.responseStatus !== filters.responseStatus) {
    return false;
  }

  if (filters.emailPresence === "has" && !creator.email) {
    return false;
  }

  if (filters.emailPresence === "missing" && creator.email) {
    return false;
  }

  if (filters.messageVersion.trim() && !normalize(creator.messageVersion).includes(normalize(filters.messageVersion))) {
    return false;
  }

  if (filters.code.trim() && !normalize(creator.code).includes(normalize(filters.code))) {
    return false;
  }

  if (filters.firstDate.trim() && !normalize(creator.firstMessageDate).includes(normalize(filters.firstDate))) {
    return false;
  }

  if (filters.lastDate.trim() && !normalize(creator.lastContactDate).includes(normalize(filters.lastDate))) {
    return false;
  }

  return true;
}

function creatorMatchesPlatformFilter(creator: CreatorRow, platform: PlatformFilter) {
  if (platform === "all") {
    return true;
  }

  return platformFromProfileUrl(creator.profileUrl) === platform;
}

function creatorMatchesReadinessFilter(creator: CreatorRow, filter: ProspectReadinessFilter) {
  return filter === "ready" ? creator.isReadyForAction === true : creator.isReadyForAction !== true;
}

function platformFromProfileUrl(profileUrl: string): Exclude<PlatformFilter, "all"> | null {
  const normalized = profileUrl.toLowerCase();
  if (normalized.includes("instagram.com")) {
    return "Instagram";
  }

  if (normalized.includes("tiktok.com")) {
    return "TikTok";
  }

  return null;
}

function creatorPlatformName(creator: CreatorRow) {
  return platformFromProfileUrl(creator.profileUrl) ?? channelName(creator.channel);
}

function creatorMatchesTodoFilters(creator: CreatorRow, filters: TodoFilters) {
  if (creator.responseStatus === "Archived") {
    return false;
  }

  if (!creatorMatchesSearch(creator, filters.query)) {
    return false;
  }

  const contactDate = latestKnownContactDate(creator);
  if (!contactDate) {
    return filters.includeNeverContacted && matchesContactability(creator, filters);
  }

  const minimumDays = toNullableNumber(filters.daysWithoutContact) ?? 0;
  if (contactAgeDays(creator) < minimumDays) {
    return false;
  }

  return matchesContactability(creator, filters);
}

// The "Responded yes" / "Has email" toggles are *narrowing* requirements: an
// unchecked toggle imposes no constraint. When both are checked, contactabilityMode
// decides whether a creator must satisfy either ("any") or both ("all").
function matchesContactability(creator: CreatorRow, filters: TodoFilters) {
  const checks = [
    filters.includeResponded ? creator.responded === true || creator.responseStatus === "Yes" : null,
    filters.includeHasEmail ? Boolean(creator.email?.trim()) : null,
  ].filter((value): value is boolean => value !== null);

  if (checks.length === 0) return true;
  return filters.contactabilityMode === "all" ? checks.every(Boolean) : checks.some(Boolean);
}

function creatorMatchesSearch(creator: CreatorRow, query: string) {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return true;

  return [
    creator.handle,
    creator.profileUrl,
    creator.email,
    creator.threadsUrl,
    creator.code,
    creator.messageVersion,
    creator.messageBody,
    creator.emailSubject,
    creator.emailBody,
  ].some((value) => normalize(value).includes(normalizedQuery));
}

function contactAgeDays(creator: CreatorRow) {
  const date = latestKnownContactDate(creator);
  if (!date) return Number.MAX_SAFE_INTEGER;

  const todayDate = new Date(`${today()}T00:00:00`);
  const contactDate = new Date(`${date}T00:00:00`);
  const diffMs = todayDate.getTime() - contactDate.getTime();
  return Math.floor(diffMs / 86_400_000);
}

function latestKnownContactDate(creator: CreatorRow) {
  return creator.lastContactDate || creator.firstMessageDate || null;
}

function labelForView(view: ViewName) {
  if (view === "creatorCodes") return "Creator Codes";
  if (view === "templates") return "Templates";
  if (view === "todo") return "Todo";
  if (view === "prospecting") return "Prospecting";
  return "Reached Out";
}

function stageLabel(stage: CreatorStage) {
  switch (stage) {
    case "Ongoing":
      return "Redeemed";
    case "Active":
      return "Activated";
    case "Converted":
      return "Converted";
    case "No redemptions":
      return "No redemptions";
  }
}

function stageClass(stage: CreatorStage) {
  switch (stage) {
    case "Ongoing":
      return "ongoing";
    case "Active":
      return "active";
    case "Converted":
      return "converted";
    case "No redemptions":
      return "none";
  }
}

function isExpiredCode(status: CreatorCodeStatus, validUntilInput: string) {
  if (status === "expired") return true;
  if (status !== "active" || !validUntilInput) return false;
  const target = parseDateLike(validUntilInput);
  return target ? startOfLocalDay(target).getTime() < startOfLocalDay(new Date()).getTime() : false;
}

function statusPillClass(status: CreatorCodeStatus, validUntilInput: string) {
  if (isExpiredCode(status, validUntilInput)) return "is-expired";
  if (status === "disabled") return "is-disabled";
  return "is-active";
}

function statusPillLabel(status: CreatorCodeStatus, validUntilInput: string) {
  if (isExpiredCode(status, validUntilInput)) return "Expired";
  if (status === "disabled") return "Disabled";
  return "Active";
}

function summarizeCreatorCodes(codes: CreatorCode[]) {
  const now = startOfLocalDay(new Date()).getTime();
  const soon = now + 14 * 86_400_000;

  return codes.reduce(
    (summary, code) => {
      const validUntil = parseDateLike(code.validUntil);
      return {
        activeCount: summary.activeCount + (code.status === "active" ? 1 : 0),
        ongoingCount: summary.ongoingCount + toCount(code.ongoingCount),
        activatedCount: summary.activatedCount + toCount(code.activatedCount),
        convertedCount: summary.convertedCount + toCount(code.convertedCount),
        expiringSoonCount: summary.expiringSoonCount + (validUntil && validUntil.getTime() >= now && validUntil.getTime() <= soon ? 1 : 0),
        zeroRedemptionCount: summary.zeroRedemptionCount + (toCount(code.ongoingCount) === 0 ? 1 : 0),
      };
    },
    { activeCount: 0, ongoingCount: 0, activatedCount: 0, convertedCount: 0, expiringSoonCount: 0, zeroRedemptionCount: 0 },
  );
}

function dateInputValue(value?: string | null) {
  return value?.slice(0, 10) ?? "";
}

function dateInputToUtcIso(value?: string | null) {
  const dateOnly = emptyToNull(value);
  return dateOnly ? new Date(`${dateOnly}T00:00:00.000Z`).toISOString() : null;
}

function formatDate(value?: string | null) {
  const date = parseDateLike(value);
  if (!date) return "";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function parseDateLike(value?: string | null) {
  if (!value) return null;
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function normalize(value?: string | null) {
  return value?.toLowerCase().trim() ?? "";
}

function normalizeTemplate(template: MessageTemplate, fallbackKind: TemplateKind = "Dm"): MessageTemplate {
  const normalizedKind = templateKind(template, fallbackKind);

  return {
    ...template,
    id: template.id ?? template.Id ?? "",
    name: template.name ?? template.Name ?? "",
    platform: template.platform ?? template.Platform ?? null,
    kind: normalizedKind,
    type: template.type ?? template.Type ?? normalizedKind,
    purpose: template.purpose ?? template.Purpose ?? null,
    category: template.category ?? template.Category ?? null,
    subject: template.subject ?? template.Subject ?? null,
    body: template.body ?? template.Body ?? "",
    generationRules: template.generationRules ?? template.GenerationRules ?? null,
    isActive: template.isActive ?? template.IsActive ?? false,
    createdAt: template.createdAt ?? template.CreatedAt ?? "",
    updatedAt: template.updatedAt ?? template.UpdatedAt ?? "",
  };
}

function templateKind(template: MessageTemplate, fallbackKind: TemplateKind = "Dm"): TemplateKind {
  return (
    explicitTemplateKind(template) ??
    (normalize(template.name ?? template.Name).includes("email") ? "Email" : fallbackKind)
  );
}

function explicitTemplateKind(template: MessageTemplate): TemplateKind | null {
  return normalizeTemplateKind(
    template.kind ??
    template.Kind ??
    template.type ??
    template.Type ??
    template.purpose ??
    template.Purpose ??
    template.category ??
    template.Category ??
    template.platform ??
    template.Platform,
  );
}

function normalizeTemplateKind(value?: string | null): TemplateKind | null {
  const normalized = normalize(value).replace(/[^a-z]/g, "");
  if (!normalized) return null;
  if (normalized === "email" || normalized === "emailtemplate" || normalized.includes("emailfollowup") || normalized.includes("followupemail")) return "Email";
  if (normalized === "dm" || normalized === "dmtemplate" || normalized === "directmessage" || normalized === "directmessagetemplate") return "Dm";
  return null;
}

function sortTemplates(items: MessageTemplate[]) {
  return [...items].sort((a, b) => {
    const kindOrder = TEMPLATE_KINDS.indexOf(templateKind(a)) - TEMPLATE_KINDS.indexOf(templateKind(b));
    return kindOrder || Number(b.isActive) - Number(a.isActive) || a.name.localeCompare(b.name);
  });
}

function findTemplateNameConflict(items: MessageTemplate[], name: string, currentId: string | null, kind: TemplateKind) {
  const normalized = normalize(name);
  if (!normalized) return null;

  return items.find((item) => item.id !== currentId && templateKind(item) === kind && normalize(item.name) === normalized) ?? null;
}

function emptyToNull(value?: string | null) {
  return value && value.trim() ? value.trim() : null;
}

function numericText(value: string) {
  return value.replace(/[^\d]/g, "");
}

function toNullableNumber(value: string | number | null | undefined) {
  if (typeof value === "number") return value;
  const cleaned = numericText(value ?? "");
  return cleaned ? Number(cleaned) : null;
}

function today() {
  return new Date().toLocaleDateString("sv-SE");
}

function rate(count: number, total: number) {
  if (total === 0) return "0%";
  return `${Math.round((count / total) * 100)}%`;
}

function formatPercentValue(value: number) {
  if (!Number.isFinite(value)) return "0%";
  const normalized = value > 1 ? value : value * 100;
  return `${Math.round(normalized)}%`;
}

function formatNumber(value: number) {
  return value.toLocaleString("en-US");
}

function formatAnimatedNumberValue(value: number, hasPercentSuffix: boolean) {
  return `${formatNumber(value)}${hasPercentSuffix ? "%" : ""}`;
}

export default App;
