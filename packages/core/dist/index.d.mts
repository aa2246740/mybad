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

export { type CategoryStats, type ContextMessage, type DateRange, type LinkDirection, type LinkType, MemoryAdapter, type Mistake, type MistakeFilter, type MistakeLink, type MistakeStatus, type OverallStats, RULE_VALID_TRANSITIONS, type Reflection, type ReflectionFilter, type Rule, type RuleFilter, type RulePriority, type RuleStatus, SQLiteAdapter, type StorageAdapter, type TriggerType, VALID_TRANSITIONS, type Verification, type VerificationCount, type VerificationResult, isValidRuleTransition, isValidTransition, runMigrations };
