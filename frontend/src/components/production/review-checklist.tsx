'use client';

/**
 * Review Checklist Component.
 *
 * 6-dimension mandatory checklist:
 *   1. 事实准确性 (accuracy)
 *   2. 原创研究标注 (gain)
 *   3. 品牌一致性 (brand)
 *   4. 合规性 (compliance)
 *   5. E-E-A-T (eeat)
 *   6. 可读性 (readability)
 *
 * All 6 must be completed + signature before submission.
 * When rejecting a dimension, a reason text is required.
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CheckCircle, XCircle } from 'lucide-react';

export type ChecklistItem = { passed: boolean; reason?: string };
export type ChecklistResult = {
  accuracy: ChecklistItem;
  gain: ChecklistItem;
  brand: ChecklistItem;
  compliance: ChecklistItem;
  eeat: ChecklistItem;
  readability: ChecklistItem;
};

const DIMENSIONS = [
  { key: 'accuracy', label: '事实准确性', description: '内容与知识库证据一致，无编造数据' },
  { key: 'gain', label: '原创研究标注', description: '包含原创分析、独到见解或一手数据' },
  { key: 'brand', label: '品牌一致性', description: '语调、风格符合品牌调性和用户预期' },
  { key: 'compliance', label: '合规性', description: '无违规内容（虚假宣传、敏感词、侵权等）' },
  { key: 'eeat', label: 'E-E-A-T', description: '经验、专业度、权威性、可信度符合 Google 质量标准' },
  { key: 'readability', label: '可读性', description: '排版清晰、逻辑通顺、适合目标受众阅读' },
] as const;

type Props = {
  onSubmit: (checklist: ChecklistResult, signature: string) => Promise<void>;
  submitting: boolean;
};

export function ReviewChecklist({ onSubmit, submitting }: Props): React.ReactElement {
  const [checklist, setChecklist] = useState<ChecklistResult>({
    accuracy: { passed: false },
    gain: { passed: false },
    brand: { passed: false },
    compliance: { passed: false },
    eeat: { passed: false },
    readability: { passed: false },
  });
  const [signature, setSignature] = useState('');

  function toggleDimension(dim: keyof ChecklistResult): void {
    setChecklist((prev) => ({
      ...prev,
      [dim]: {
        passed: !prev[dim].passed,
        reason: prev[dim].passed ? undefined : prev[dim].reason, // clear reason on pass
      },
    }));
  }

  function setReason(dim: keyof ChecklistResult, reason: string): void {
    setChecklist((prev) => ({
      ...prev,
      [dim]: { ...prev[dim], reason },
    }));
  }

  // Check if all dimensions are filled and signature is present
  const allFilled = DIMENSIONS.every((d) => {
    const item = checklist[d.key as keyof ChecklistResult];
    return item.passed || (item.reason && item.reason.trim().length > 0);
  });

  const canSubmit = allFilled && signature.trim().length > 0 && !submitting;

  const passedCount = DIMENSIONS.filter((d) => checklist[d.key as keyof ChecklistResult].passed).length;

  return (
    <div className="space-y-4">
      {/* Progress indicator */}
      <div className="flex items-center gap-2 text-sm">
        <span className="font-medium">审核进度：</span>
        <span className={passedCount === 6 ? 'text-green-600' : 'text-amber-600'}>
          {passedCount} / 6 项通过
        </span>
      </div>

      {/* Dimensions */}
      <div className="space-y-3">
        {DIMENSIONS.map(({ key, label, description }) => {
          const item = checklist[key as keyof ChecklistResult];
          return (
            <div
              key={key}
              className={`rounded-md border p-3 transition-colors ${
                item.passed
                  ? 'border-green-200 bg-green-50/30'
                  : 'border-zinc-200'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    {item.passed ? (
                      <CheckCircle className="h-4 w-4 text-green-600 flex-shrink-0" />
                    ) : (
                      <XCircle className="h-4 w-4 text-zinc-300 flex-shrink-0" />
                    )}
                    <span className="text-sm font-medium">{label}</span>
                  </div>
                  <p className="text-xs text-zinc-400 ml-6">{description}</p>

                  {!item.passed && (
                    <div className="mt-2 ml-6">
                      <Input
                        className="h-8 text-xs"
                        placeholder="请填写未通过的原因..."
                        value={item.reason ?? ''}
                        onChange={(e) => setReason(key as keyof ChecklistResult, e.target.value)}
                      />
                    </div>
                  )}
                </div>
                <Button
                  variant={item.passed ? 'default' : 'outline'}
                  size="sm"
                  className="h-7 text-xs flex-shrink-0"
                  onClick={() => toggleDimension(key as keyof ChecklistResult)}
                >
                  {item.passed ? '通过' : '未通过'}
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Signature */}
      <div className="space-y-2">
        <label className="text-sm font-medium">审核人签名</label>
        <Input
          placeholder="请输入您的姓名"
          value={signature}
          onChange={(e) => setSignature(e.target.value)}
        />
      </div>

      {/* Submit */}
      <Button
        className="w-full"
        disabled={!canSubmit}
        onClick={() => onSubmit(checklist, signature.trim())}
      >
        {submitting
          ? '提交中...'
          : !allFilled
            ? '请完成全部 6 项审核'
            : !signature.trim()
              ? '请填写签名'
              : `提交审核（${passedCount}/6 通过）`}
      </Button>
    </div>
  );
}
