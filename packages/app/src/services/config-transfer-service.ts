import type { PresetModel } from "@/constants/preset-models";
import type { VectorModelConfig } from "@/store/llama-store";
import type { SelectedModel } from "@/store/provider-store";
import type { TTSConfig } from "@/store/tts-store";
import { useAppSettingsStore } from "@/store/app-settings-store";
import { useLlamaStore } from "@/store/llama-store";
import { useProviderStore } from "@/store/provider-store";
import { useTTSStore } from "@/store/tts-store";
import type { SystemSettings } from "@/types/settings";

export interface AppConfigExportData {
  version: 1;
  exportedAt: string;
  providers: {
    modelProviders: ModelProvider[];
    selectedModel: SelectedModel | null;
  };
  vector: {
    vectorModels: VectorModelConfig[];
    selectedVectorModelId: string | null;
    vectorModelEnabled: boolean;
    embeddingModels: PresetModel[];
    modelPath: string;
    testText: string;
  };
  tts: TTSConfig;
  appSettings: SystemSettings;
}

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null;
};

export const buildExportConfigData = (): AppConfigExportData => {
  const providerState = useProviderStore.getState();
  const llamaState = useLlamaStore.getState();
  const ttsState = useTTSStore.getState();
  const appSettingsState = useAppSettingsStore.getState();

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    providers: {
      modelProviders: providerState.modelProviders,
      selectedModel: providerState.selectedModel,
    },
    vector: {
      vectorModels: llamaState.vectorModels,
      selectedVectorModelId: llamaState.selectedVectorModelId,
      vectorModelEnabled: llamaState.vectorModelEnabled,
      embeddingModels: llamaState.embeddingModels,
      modelPath: llamaState.modelPath,
      testText: llamaState.testText,
    },
    tts: ttsState.config,
    appSettings: appSettingsState.settings,
  };
};

export const exportConfigAsJson = () => {
  return JSON.stringify(buildExportConfigData(), null, 2);
};

export const importConfigFromJson = (json: string) => {
  const parsedData: unknown = JSON.parse(json);

  if (!isRecord(parsedData) || parsedData.version !== 1) {
    throw new Error("配置文件格式不支持");
  }

  if (isRecord(parsedData.providers) && Array.isArray(parsedData.providers.modelProviders)) {
    const providerStore = useProviderStore.getState();
    providerStore.setModelProviders(parsedData.providers.modelProviders as ModelProvider[]);
    providerStore.setSelectedModel((parsedData.providers.selectedModel as SelectedModel | null | undefined) ?? null);
  }

  if (isRecord(parsedData.vector)) {
    const llamaStore = useLlamaStore.getState();

    if (Array.isArray(parsedData.vector.vectorModels)) {
      llamaStore.setVectorModels(parsedData.vector.vectorModels as VectorModelConfig[]);
    }
    if (typeof parsedData.vector.selectedVectorModelId === "string" || parsedData.vector.selectedVectorModelId === null) {
      llamaStore.setSelectedVectorModelId(parsedData.vector.selectedVectorModelId);
    }
    if (typeof parsedData.vector.vectorModelEnabled === "boolean") {
      llamaStore.setVectorModelEnabled(parsedData.vector.vectorModelEnabled);
    }
    if (Array.isArray(parsedData.vector.embeddingModels)) {
      llamaStore.setEmbeddingModels(parsedData.vector.embeddingModels as PresetModel[]);
    }
    if (typeof parsedData.vector.modelPath === "string") {
      llamaStore.setModelPath(parsedData.vector.modelPath);
    }
    if (typeof parsedData.vector.testText === "string") {
      llamaStore.setTestText(parsedData.vector.testText);
    }
  }

  if (isRecord(parsedData.tts)) {
    useTTSStore.getState().setConfig(parsedData.tts as Partial<TTSConfig>);
  }

  if (isRecord(parsedData.appSettings)) {
    useAppSettingsStore.getState().setSettings(parsedData.appSettings as SystemSettings);
  }
};
