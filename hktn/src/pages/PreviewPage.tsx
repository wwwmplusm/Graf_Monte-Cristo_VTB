import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getPreview, saveProductConsents } from '../api/client';
import { useNotifications } from '../state/notifications';
import { useUser } from '../state/useUser';

type Product = {
  id: string;
  name?: string;
  product_type?: string;
  outstanding_balance?: number;
  bank_id?: string;
  consented?: boolean;
};

type ProductsMap = Record<string, Product[]>;

export const PreviewPage: React.FC = () => {
  const { userId } = useUser();
  const { notifyError, notifySuccess } = useNotifications();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [products, setProducts] = useState<ProductsMap>({});

  useEffect(() => {
    const load = async () => {
      if (!userId) return;
      try {
        setLoading(true);
        const response = await getPreview({ user_id: userId });
        setProducts(response.productsByBank ?? {});
      } catch (error) {
        console.error(error);
        notifyError('Не удалось загрузить продукты. Проверьте консенты.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [notifyError, userId]);

  const toggleProduct = (bankId: string, productId: string) => {
    setProducts((prev) => {
      const next = { ...prev };
      next[bankId] = (next[bankId] ?? []).map((product) =>
        product.id === productId ? { ...product, consented: !product.consented } : product
      );
      return next;
    });
  };

  const flattenedItems = useMemo(() => {
    const entries: Array<{ bank_id: string; product_id: string; product_type?: string; consented: boolean }> = [];
    for (const [bankId, list] of Object.entries(products)) {
      list.forEach((product) => {
        entries.push({
          bank_id: bankId,
          product_id: product.id,
          product_type: product.product_type,
          consented: Boolean(product.consented ?? true),
        });
      });
    }
    return entries;
  }, [products]);

  const handleSave = async () => {
    if (!userId) return;
    try {
      setSaving(true);
      await saveProductConsents({ user_id: userId, items: flattenedItems });
      notifySuccess('Согласия на продукты сохранены');
      navigate('/goals');
    } catch (error) {
      console.error(error);
      notifyError('Не удалось сохранить выбор');
    } finally {
      setSaving(false);
    }
  };

  const hasProducts = Object.values(products).some((list) => list.length > 0);

  return (
    <div className="app-main">
      <div className="card">
        <h2>Шаг 4. Выбор счетов и кредитов</h2>
        <p>Выберите продукты, которые будем анализировать.</p>
      </div>
      {loading ? <div className="card">Загрузка...</div> : null}
      {!loading && !hasProducts ? (
        <div className="card">
          <p>Банк ещё не вернул продукты. Можно продолжить с пустым набором.</p>
          <button className="btn" onClick={() => navigate('/goals')}>
            Продолжить
          </button>
        </div>
      ) : null}
      {Object.entries(products).map(([bankId, list]) => (
        <div key={bankId} className="card">
          <h3>Банк {bankId}</h3>
          <ul className="list">
            {list.map((product) => (
              <li key={product.id}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <input
                    type="checkbox"
                    checked={product.consented ?? true}
                    onChange={() => toggleProduct(bankId, product.id)}
                  />
                  <div>
                    <strong>{product.name || product.product_type || product.id}</strong>
                    <div style={{ fontSize: 14, color: '#475569' }}>
                      Баланс: {product.outstanding_balance ?? '—'}
                    </div>
                  </div>
                </label>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {hasProducts ? (
        <button className="btn" disabled={saving} onClick={handleSave}>
          Сохранить и продолжить
        </button>
      ) : null}
    </div>
  );
};
