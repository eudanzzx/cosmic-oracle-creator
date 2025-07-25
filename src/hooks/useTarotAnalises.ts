
import { useState, useEffect, useMemo } from 'react';
import useUserDataService from "@/services/userDataService";
import { TarotAnalysis } from "@/services/tarotAnalysisService";
import { toast } from "sonner";

export const useTarotAnalises = () => {
  const { getAllTarotAnalyses, deleteTarotAnalysis, saveTarotAnalysisWithPlan, checkClientBirthday, getPlanos, savePlanos } = useUserDataService();
  
  const [analises, setAnalises] = useState<TarotAnalysis[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'todas' | 'finalizadas' | 'em-andamento'>('todas');
  const [selectedPeriod, setSelectedPeriod] = useState<'semana' | 'mes' | 'ano' | 'total'>('mes');
  const [aniversarianteHoje, setAniversarianteHoje] = useState<{ nome: string; dataNascimento: string } | null>(null);

  useEffect(() => {
    loadAnalises();
  }, []);

  useEffect(() => {
    const handleDataUpdated = () => {
      loadAnalises();
    };

    window.addEventListener('tarotAnalysesUpdated', handleDataUpdated);
    
    return () => {
      window.removeEventListener('tarotAnalysesUpdated', handleDataUpdated);
    };
  }, []);

  const loadAnalises = () => {
    const allAnalises = getAllTarotAnalyses();
    setAnalises(allAnalises);

    // Verificar aniversariante do dia
    if (allAnalises.length > 0) {
      const aniversariante = allAnalises.find(analise => {
        if (!analise.dataNascimento) return false;
        const birthDate = new Date(analise.dataNascimento).toISOString().slice(0, 10);
        return checkClientBirthday(birthDate);
      });

      if (aniversariante) {
        setAniversarianteHoje({
          nome: aniversariante.nomeCliente || aniversariante.clientName,
          dataNascimento: aniversariante.dataNascimento
        });
      } else {
        setAniversarianteHoje(null);
      }
    }
  };

  const tabAnalises = useMemo(() => {
    return analises.filter(analise => {
      if (activeTab === 'finalizadas') return analise.finalizado;
      if (activeTab === 'em-andamento') return !analise.finalizado;
      return true;
    });
  }, [analises, activeTab]);

  const recebidoStats = useMemo(() => {
    const now = new Date();
    const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay()));
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);

    const filteredAnalises = tabAnalises.filter(analise => {
      if (selectedPeriod === 'total') return true;
      
      const analiseDate = new Date(analise.dataAtendimento);
      if (selectedPeriod === 'semana') return analiseDate >= startOfWeek;
      if (selectedPeriod === 'mes') return analiseDate >= startOfMonth;
      if (selectedPeriod === 'ano') return analiseDate >= startOfYear;
      
      return true;
    });

    return {
      total: filteredAnalises.reduce((sum, analise) => sum + (Number(analise.valor) || 0), 0),
      semana: tabAnalises.filter(a => new Date(a.dataAtendimento) >= startOfWeek).reduce((sum, a) => sum + (Number(a.valor) || 0), 0),
      mes: tabAnalises.filter(a => new Date(a.dataAtendimento) >= startOfMonth).reduce((sum, a) => sum + (Number(a.valor) || 0), 0),
      ano: tabAnalises.filter(a => new Date(a.dataAtendimento) >= startOfYear).reduce((sum, a) => sum + (Number(a.valor) || 0), 0),
    };
  }, [tabAnalises, selectedPeriod]);

  const getStatusCounts = useMemo(() => ({
    finalizados: analises.filter(a => a.finalizado).length,
    emAndamento: analises.filter(a => !a.finalizado).length,
    atencao: 0,
  }), [analises]);

  const handleDelete = async (id: string) => {
    try {
      // Buscar a análise que será excluída
      const analiseToDelete = analises.find(a => a.id === id);
      
      if (analiseToDelete) {
        // Remover planos relacionados a esta análise
        const allPlanos = getPlanos();
        const updatedPlanos = allPlanos.filter(plano => {
          // Remover planos que têm o analysisId igual ao id da análise
          if ('analysisId' in plano && plano.analysisId === id) {
            return false;
          }
          // Remover também planos semanais que começam com o id da análise
          if (plano.type === 'semanal' && plano.id.startsWith(`${id}-week-`)) {
            return false;
          }
          // Remover planos mensais que começam com o id da análise  
          if (plano.type === 'plano' && plano.id.startsWith(`${id}-month-`)) {
            return false;
          }
          return true;
        });
        
        // Salvar planos atualizados
        if (updatedPlanos.length !== allPlanos.length) {
          savePlanos(updatedPlanos);
          console.log(`Removidos ${allPlanos.length - updatedPlanos.length} planos relacionados à análise ${id}`);
        }
      }
      
      // Excluir a análise
      deleteTarotAnalysis(id);
      
      // Atualizar lista local
      setAnalises(prev => prev.filter(analise => analise.id !== id));
      
      // Disparar eventos de sincronização
      window.dispatchEvent(new CustomEvent('tarotAnalysesUpdated'));
      window.dispatchEvent(new CustomEvent('planosUpdated'));
      window.dispatchEvent(new CustomEvent('tarot-payment-updated'));
      
      toast.success('Análise excluída com sucesso');
    } catch (error) {
      console.error('Erro ao excluir análise:', error);
      toast.error('Erro ao excluir análise');
    }
  };

  const handleToggleFinished = (id: string) => {
    const analise = analises.find(a => a.id === id);
    if (!analise) return;
    
    const updatedAnalise = { ...analise, finalizado: !analise.finalizado };
    
    // Usar saveTarotAnalysisWithPlan para garantir que os planos sejam criados/atualizados
    console.log('🔧 handleToggleFinished - Usando saveTarotAnalysisWithPlan para:', updatedAnalise.id);
    saveTarotAnalysisWithPlan(updatedAnalise);
    
    // Atualizar lista local
    const updatedAnalises = analises.map(a => 
      a.id === id ? updatedAnalise : a
    );
    setAnalises(updatedAnalises);
    
    toast.success(`Análise ${updatedAnalise.finalizado ? 'finalizada' : 'reaberta'} com sucesso`);
    
    window.dispatchEvent(new CustomEvent('tarotAnalysesUpdated'));
  };

  const handlePeriodChange = (period: 'semana' | 'mes' | 'ano' | 'total') => {
    setSelectedPeriod(period);
  };

  return {
    analises,
    tabAnalises,
    searchTerm,
    setSearchTerm,
    activeTab,
    setActiveTab,
    selectedPeriod,
    handlePeriodChange,
    aniversarianteHoje,
    recebidoStats,
    getStatusCounts,
    handleDelete,
    handleToggleFinished,
  };
};
