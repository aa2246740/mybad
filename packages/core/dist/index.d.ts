import { Database } from 'better-sqlite3';

/** 错题状态 */
type MistakeStatus = 'pending' | 'corrected' | 'recurring' | 'verified' | 'graduated' | 'abandoned' | 'false_positive';
/** 触发信号级别 */
type TriggerType = 'L1' | 'L2' | 'L3' | 'L4' | 'L5' | 'manual';
/** 上下文消息 */
interface ContextMessage {
    role: string;
    content: string;
}
/** 错题 */
interface Mistake {
    /** 主键, 格式 'm_{timestamp}_{suffix}' */
    id: string;
    /** Agent 判定的错误分类 */
    category: string;
    /** 当前状态 */
    status: MistakeStatus;
    /** 触发级别 */
    trigger_type: TriggerType;
    /** 同 category 递增计数 */
    recurrence_count: number;
    /** 纠正前的上下文 (JSON 序列化的 ContextMessage[]) */
    context_before: string;
    /** 纠正后的上下文 (JSON 序列化的 ContextMessage[]) */
    context_after?: string;
    /** AI 理解成了什么 */
    ai_misunderstanding?: string;
    /** 用户本意 */
    user_intent?: string;
    /** 用户纠正原话 */
    user_correction?: string;
    /** 哪个 Agent */
    agent_id?: string;
    /** 哪个会话 */
    session_id?: string;
    /** 标签列表 */
    tags: string[];
    /** 置信度 0-1 */
    confidence: number;
    /** 毕业后关联到的规则 ID */
    graduated_to_rule?: string;
    /** ISO 8601 */
    created_at: string;
    /** ISO 8601 */
    updated_at: string;
    /** ISO 8601 */
    archived_at?: string;
}
/** 错题查询过滤器 */
interface MistakeFilter {
    category?: string;
    status?: MistakeStatus;
    agent_id?: string;
    date_from?: string;
    date_to?: string;
    recurrence_min?: number;
    limit?: number;
    offset?: number;
}

/** 规则状态 */
type RuleStatus = 'active' | 'verified' | 'superseded' | 'archived';
/** 规则优先级 */
type RulePriority = 'normal' | 'high' | 'critical';
/** 规则（错题压缩产物） */
interface Rule {
    id: string;
    category: string;
    /** 人类可读规则文本 */
    rule_text: string;
    priority: RulePriority;
    /** 从多少条错题提炼 */
    source_count: number;
    /** 来源错题 ID 列表 */
    source_ids: string[];
    /** 正向验证次数 */
    verified_count: number;
    /** 验证失败次数 */
    fail_count: number;
    status: RuleStatus;
    /** 被哪条规则替代 */
    superseded_by?: string;
    created_at: string;
    updated_at: string;
}
/** 规则查询过滤器 */
interface RuleFilter {
    category?: string;
    priority?: RulePriority;
    status?: RuleStatus;
    limit?: number;
    offset?: number;
}

/** 关联类型 */
type LinkType = 'same_category' | 'causal' | 'same_root' | 'semantic';
/** 查询方向 */
type LinkDirection = 'inbound' | 'outbound' | 'both';
/** 错题关联 */
interface MistakeLink {
    from_id: string;
    to_id: string;
    link_type: LinkType;
    confidence: number;
    created_at: string;
}

/** 验证结果 */
type VerificationResult = 'pass' | 'fail';
/** 验证记录 */
interface Verification {
    /** 自增 ID (SQLite AUTOINCREMENT) */
    id?: number;
    rule_id: string;
    result: VerificationResult;
    context?: string;
    agent_id?: string;
    verified_at: string;
}
/** 验证计数 */
interface VerificationCount {
    pass: number;
    fail: number;
}

/** 反思记录 */
interface Reflection {
    id: string;
    /** 反思日期 'YYYY-MM-DD', UNIQUE */
    date: string;
    /** 反思内容 */
    summary: string;
    /** 新提炼的规则 IDs */
    new_rule_ids: string[];
    /** 高频错误分类 */
    hot_categories: string[];
    /** 当日统计 */
    stats: Record<string, unknown>;
    agent_id?: string;
    created_at: string;
}
/** 反思查询过滤器 */
interface ReflectionFilter {
    date_from?: string;
    date_to?: string;
    agent_id?: string;
    limit?: number;
    offset?: number;
}

/** 错题合法状态流转矩阵 */
declare const VALID_TRANSITIONS: Record<MistakeStatus, MistakeStatus[]>;
/** 规则合法状态流转矩阵 */
declare const RULE_VALID_TRANSITIONS: Record<RuleStatus, RuleStatus[]>;
/** 判断错题状态流转是否合法 */
declare function isValidTransition(from: MistakeStatus, to: MistakeStatus): boolean;
/** 判断规则状态流转是否合法 */
declare function isValidRuleTransition(from: RuleStatus, to: RuleStatus): boolean;

/** 日期范围 */
interface DateRange {
    from: string;
    to: string;
}
/** 分类统计 */
interface CategoryStats {
    category: string;
    count: number;
    recurrence_total: number;
    by_status: Record<string, number>;
}
/** 全局统计 */
interface OverallStats {
    total: number;
    by_status: Record<string, number>;
    by_category: Record<string, number>;
    total_rules: number;
    total_verifications: number;
}
/** 存储适配器接口 — SQLite 和 Memory 共用 */
interface StorageAdapter {
    addMistake(mistake: Mistake): Promise<string>;
    getMistake(id: string): Promise<Mistake | null>;
    updateMistake(id: string, updates: Partial<Mistake>): Promise<void>;
    queryMistakes(filter: MistakeFilter): Promise<Mistake[]>;
    incrementRecurrence(category: string, agentId?: string): Promise<number>;
    addLink(from: string, to: string, type: string, confidence?: number): Promise<void>;
    getLinks(id: string, direction?: LinkDirection): Promise<MistakeLink[]>;
    getRelated(id: string, depth?: number): Promise<MistakeLink[]>;
    addRule(rule: Rule): Promise<string>;
    getRules(filter?: RuleFilter): Promise<Rule[]>;
    updateRule(id: string, updates: Partial<Rule>): Promise<void>;
    addVerification(verification: Verification): Promise<void>;
    getVerificationCount(ruleId: string): Promise<VerificationCount>;
    addReflection(reflection: Reflection): Promise<string>;
    getReflections(filter?: ReflectionFilter): Promise<Reflection[]>;
    getCategoryStats(agentId?: string): Promise<CategoryStats[]>;
    getOverallStats(agentId?: string, dateRange?: DateRange): Promise<OverallStats>;
    searchMistakes(query: string, limit?: number): Promise<Mistake[]>;
    archiveMistakes(ids: string[]): Promise<number>;
    compactGraduated(category?: string): Promise<number>;
    getConfig(key: string): Promise<unknown>;
    setConfig(key: string, value: unknown): Promise<void>;
}

/** SQLite 存储适配器 */
declare class SQLiteAdapter implements StorageAdapter {
    private db;
    constructor(dbPath: string);
    close(): void;
    addMistake(mistake: Mistake): Promise<string>;
    getMistake(id: string): Promise<Mistake | null>;
    updateMistake(id: string, updates: Partial<Mistake>): Promise<void>;
    queryMistakes(filter: MistakeFilter): Promise<Mistake[]>;
    incrementRecurrence(category: string, agentId?: string): Promise<number>;
    addLink(from: string, to: string, type: string, confidence?: number): Promise<void>;
    getLinks(id: string, direction?: LinkDirection): Promise<MistakeLink[]>;
    getRelated(id: string, depth?: number): Promise<MistakeLink[]>;
    addRule(rule: Rule): Promise<string>;
    getRules(filter?: RuleFilter): Promise<Rule[]>;
    updateRule(id: string, updates: Partial<Rule>): Promise<void>;
    addVerification(verification: Verification): Promise<void>;
    getVerificationCount(ruleId: string): Promise<VerificationCount>;
    addReflection(reflection: Reflection): Promise<string>;
    getReflections(filter?: ReflectionFilter): Promise<Reflection[]>;
    getCategoryStats(agentId?: string): Promise<CategoryStats[]>;
    getOverallStats(agentId?: string, dateRange?: DateRange): Promise<OverallStats>;
    searchMistakes(query: string, limit?: number): Promise<Mistake[]>;
    archiveMistakes(ids: string[]): Promise<number>;
    compactGraduated(category?: string): Promise<number>;
    getConfig(key: string): Promise<unknown>;
    setConfig(key: string, value: unknown): Promise<void>;
}

/** 内存存储适配器 — 用于测试 */
declare class MemoryAdapter implements StorageAdapter {
    private mistakes;
    private rules;
    private links;
    private verifications;
    private reflections;
    private config;
    addMistake(mistake: Mistake): Promise<string>;
    getMistake(id: string): Promise<Mistake | null>;
    updateMistake(id: string, updates: Partial<Mistake>): Promise<void>;
    queryMistakes(filter: MistakeFilter): Promise<Mistake[]>;
    incrementRecurrence(category: string, agentId?: string): Promise<number>;
    addLink(from: string, to: string, type: string, confidence?: number): Promise<void>;
    getLinks(id: string, direction?: LinkDirection): Promise<MistakeLink[]>;
    getRelated(id: string, depth?: number): Promise<MistakeLink[]>;
    addRule(rule: Rule): Promise<string>;
    getRules(filter?: RuleFilter): Promise<Rule[]>;
    updateRule(id: string, updates: Partial<Rule>): Promise<void>;
    addVerification(verification: Verification): Promise<void>;
    getVerificationCount(ruleId: string): Promise<VerificationCount>;
    addReflection(reflection: Reflection): Promise<string>;
    getReflections(filter?: ReflectionFilter): Promise<Reflection[]>;
    getCategoryStats(agentId?: string): Promise<CategoryStats[]>;
    getOverallStats(agentId?: string, dateRange?: DateRange): Promise<OverallStats>;
    searchMistakes(query: string, limit?: number): Promise<Mistake[]>;
    archiveMistakes(ids: string[]): Promise<number>;
    compactGraduated(category?: string): Promise<number>;
    getConfig(key: string): Promise<unknown>;
    setConfig(key: string, value: unknown): Promise<void>;
}

/** 执行全部 pending migrations */
declare function runMigrations(db: Database): void;

/** CRUD 引擎 — 错题和规则的增删改查 + recurrence 原子计数 */
declare class CrudEngine {
    private storage;
    constructor(storage: StorageAdapter);
    /** 捕捉错题，自动处理 recurrence 计数和同 category 自动关联 */
    addMistake(input: Omit<Mistake, 'id' | 'created_at' | 'updated_at' | 'recurrence_count'>): Promise<Mistake>;
    /** 获取单个错题 */
    getMistake(id: string): Promise<Mistake | null>;
    /** 更新错题 */
    updateMistake(id: string, updates: Partial<Mistake>): Promise<void>;
    /** 查询错题 */
    queryMistakes(filter: MistakeFilter): Promise<Mistake[]>;
    /** 创建规则 */
    addRule(input: Omit<Rule, 'id' | 'created_at' | 'updated_at' | 'verified_count' | 'fail_count' | 'source_count'>): Promise<Rule>;
    /** 查询规则 */
    getRules(filter?: RuleFilter): Promise<Rule[]>;
    /** 更新规则 */
    updateRule(id: string, updates: Partial<Rule>): Promise<void>;
    /** 添加验证记录，同时更新规则的 verified_count/fail_count */
    addVerification(input: Omit<Verification, 'id'>): Promise<void>;
    /** 全文搜索错题 */
    searchMistakes(query: string, limit?: number): Promise<Mistake[]>;
}

/** 关联引擎 — 错题之间的正向/反向/递归关联查询 */
declare class LinkerEngine {
    private storage;
    constructor(storage: StorageAdapter);
    /** 建立关联，幂等（重复不报错） */
    addLink(fromId: string, toId: string, type: LinkType, confidence?: number): Promise<void>;
    /** 获取直接关联 */
    getLinks(id: string, direction?: LinkDirection): Promise<MistakeLink[]>;
    /** 获取多度关联（递归查询） */
    getRelated(id: string, depth?: number): Promise<MistakeLink[]>;
}

/** 非法状态流转错误 */
declare class InvalidTransitionError extends Error {
    readonly from: string;
    readonly to: string;
    constructor(from: string, to: string);
}
/** 生命周期引擎 — 状态流转 + 毕业检查 + 压缩归档 */
declare class LifecycleEngine {
    private storage;
    constructor(storage: StorageAdapter);
    /** 状态流转，校验合法性 */
    transition(mistakeId: string, toStatus: MistakeStatus): Promise<Mistake>;
    /** 规则状态流转 */
    transitionRule(ruleId: string, toStatus: RuleStatus): Promise<Rule>;
    /** 检查是否满足毕业条件: recurrence >= 2 且有同 category 的规则 */
    checkGraduation(mistakeId: string): Promise<{
        eligible: boolean;
        rule?: Rule;
    }>;
    /** 压缩已毕业的错题 */
    compact(category?: string): Promise<number>;
}

/** 反思输入数据 — 供 Agent LLM 分析用 */
interface ReflectionInput {
    pending_mistakes: number;
    recurring_mistakes: number;
    hot_categories: CategoryStats[];
    linked_groups: {
        id: string;
        related_count: number;
    }[];
    date_range: {
        from: string;
        to: string;
    };
}
/** 统计引擎 — 聚合统计 + 反思数据 */
declare class StatsEngine {
    private storage;
    constructor(storage: StorageAdapter);
    /** 获取分类统计 */
    getCategoryStats(agentId?: string): Promise<CategoryStats[]>;
    /** 获取全局统计 */
    getOverallStats(agentId?: string, dateRange?: DateRange): Promise<OverallStats>;
    /** 获取结构化反思输入数据 */
    getReflectionData(options?: {
        dateFrom?: string;
        dateTo?: string;
        includeCategories?: string[];
        minRecurrence?: number;
    }): Promise<ReflectionInput>;
}

/** MyBad 引擎 — 组合所有子引擎的 facade */
declare class MyBadEngine {
    readonly crud: CrudEngine;
    readonly linker: LinkerEngine;
    readonly lifecycle: LifecycleEngine;
    readonly stats: StatsEngine;
    constructor(storage: StorageAdapter);
    addMistake(input: Parameters<CrudEngine['addMistake']>[0]): Promise<Mistake>;
    getMistake(id: string): Promise<Mistake | null>;
    updateMistake(id: string, updates: Partial<Mistake>): Promise<void>;
    queryMistakes(filter: MistakeFilter): Promise<Mistake[]>;
    addRule(input: Parameters<CrudEngine['addRule']>[0]): Promise<Rule>;
    getRules(filter?: RuleFilter): Promise<Rule[]>;
    updateRule(id: string, updates: Partial<Rule>): Promise<void>;
    addVerification(input: Omit<Verification, 'id'>): Promise<void>;
    searchMistakes(query: string, limit?: number): Promise<Mistake[]>;
    addLink(fromId: string, toId: string, type: LinkType, confidence?: number): Promise<void>;
    getLinks(id: string, direction?: LinkDirection): Promise<MistakeLink[]>;
    getRelated(id: string, depth?: number): Promise<MistakeLink[]>;
    transition(mistakeId: string, toStatus: Mistake['status']): Promise<Mistake>;
    transitionRule(ruleId: string, toStatus: Rule['status']): Promise<Rule>;
    checkGraduation(mistakeId: string): Promise<{
        eligible: boolean;
        rule?: Rule;
    }>;
    compact(category?: string): Promise<number>;
    getCategoryStats(agentId?: string): Promise<CategoryStats[]>;
    getOverallStats(agentId?: string, dateRange?: DateRange): Promise<OverallStats>;
    getReflectionData(options?: Parameters<StatsEngine['getReflectionData']>[0]): Promise<ReflectionInput>;
}

export { type CategoryStats, type ContextMessage, CrudEngine, type DateRange, InvalidTransitionError, LifecycleEngine, type LinkDirection, type LinkType, LinkerEngine, MemoryAdapter, type Mistake, type MistakeFilter, type MistakeLink, type MistakeStatus, MyBadEngine, type OverallStats, RULE_VALID_TRANSITIONS, type Reflection, type ReflectionFilter, type ReflectionInput, type Rule, type RuleFilter, type RulePriority, type RuleStatus, SQLiteAdapter, StatsEngine, type StorageAdapter, type TriggerType, VALID_TRANSITIONS, type Verification, type VerificationCount, type VerificationResult, isValidRuleTransition, isValidTransition, runMigrations };
