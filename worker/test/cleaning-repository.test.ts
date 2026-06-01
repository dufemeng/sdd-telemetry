import { describe, expect, it, vi } from "vitest";
import { CleaningRepository } from "../src/jobs/cleaning.repository";

describe("CleaningRepository.loadWorkItemIdsBySkillUsageIds", () => {
  it("用一次查询批量加载 skill_usage_id 到 work_item_id 的映射", async () => {
    const query = vi.fn().mockResolvedValue([
      [
        { id: 1, work_item_id: 10 },
        { id: "2", work_item_id: null },
      ],
    ]);
    const repo = new CleaningRepository();

    const result = await repo.loadWorkItemIdsBySkillUsageIds(
      { query } as never,
      ["1", "2"],
    );

    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]?.[0]).toContain("WHERE id IN (?,?)");
    expect(query.mock.calls[0]?.[1]).toEqual(["1", "2"]);
    expect(result).toEqual(
      new Map<string, string | null>([
        ["1", "10"],
        ["2", null],
      ]),
    );
  });

  it("空列表不访问数据库", async () => {
    const query = vi.fn();
    const repo = new CleaningRepository();

    const result = await repo.loadWorkItemIdsBySkillUsageIds(
      { query } as never,
      [],
    );

    expect(query).not.toHaveBeenCalled();
    expect(result.size).toBe(0);
  });
});

describe("CleaningRepository.loadUserWikiRoots", () => {
  it("把 MySQL BIGINT number id 归一化成 string key", async () => {
    const query = vi
      .fn()
      .mockResolvedValue([[{ id: 2762, wiki_root_path: "/Users/u/wiki" }]]);
    const repo = new CleaningRepository();

    const result = await repo.loadUserWikiRoots({ query } as never);

    expect(result).toEqual(new Map([["2762", "/Users/u/wiki"]]));
  });
});

describe("CleaningRepository.listToolCallsForWikiRecalls", () => {
  it("把 tool_call 和 skill_usage 的 numeric id 归一化成 string", async () => {
    const query = vi.fn().mockResolvedValue([
      [
        {
          id: 97,
          interactionId: 44,
          skillUsageId: 482,
          toolName: "Read",
          toolInputPreview: '{"file_path":"/Users/u/wiki/SUMMARY.md"}',
          sequence: "12",
        },
      ],
    ]);
    const repo = new CleaningRepository();

    const result = await repo.listToolCallsForWikiRecalls({ query } as never, [
      "44",
    ]);

    expect(result).toEqual([
      {
        id: "97",
        interactionId: "44",
        skillUsageId: "482",
        toolName: "Read",
        toolInputPreview: '{"file_path":"/Users/u/wiki/SUMMARY.md"}',
        sequence: 12,
      },
    ]);
  });
});

describe("CleaningRepository.listDiscussionTurnsForWrite", () => {
  it("用上一次写入或 session 起点作为讨论窗口下界，而不是 skill 激活时间", async () => {
    const query = vi.fn().mockResolvedValue([
      [
        {
          id: 11,
          startedAt: "2026-05-25 14:40:00.000",
          anchorEventTime: "2026-05-25 14:30:00.000",
        },
      ],
    ]);
    const repo = new CleaningRepository();
    const writeEventTime = new Date("2026-05-25T15:01:01.176Z");

    const result = await repo.listDiscussionTurnsForWrite({ query } as never, {
      sessionId: "sess-1",
      writeEventTime,
    });

    const sql = String(query.mock.calls[0]?.[0]);
    const params = query.mock.calls[0]?.[1];

    expect(sql).toContain("MAX(awr.event_time)");
    expect(sql).toContain("MIN(i2.started_at)");
    expect(sql).not.toContain("prompt_id = ?");
    expect(params).toEqual([
      writeEventTime,
      "sess-1",
      writeEventTime,
      writeEventTime,
    ]);
    expect(result).toEqual([
      {
        id: "11",
        startedAt: new Date("2026-05-25 14:40:00.000"),
        anchorEventTime: new Date("2026-05-25 14:30:00.000"),
      },
    ]);
  });
});
