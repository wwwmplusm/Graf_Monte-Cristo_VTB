import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getPreview, saveProductConsents } from '../api/client';
import { useNotifications } from '../state/notifications';
import { useUser } from '../state/useUser';
export const PreviewPage = () => {
    const { userId } = useUser();
    const { notifyError, notifySuccess } = useNotifications();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [products, setProducts] = useState({});
    useEffect(() => {
        const load = async () => {
            if (!userId)
                return;
            try {
                setLoading(true);
                const response = await getPreview({ user_id: userId });
                setProducts(response.productsByBank ?? {});
            }
            catch (error) {
                console.error(error);
                notifyError('Не удалось загрузить продукты. Проверьте консенты.');
            }
            finally {
                setLoading(false);
            }
        };
        load();
    }, [notifyError, userId]);
    const toggleProduct = (bankId, productId) => {
        setProducts((prev) => {
            const next = { ...prev };
            next[bankId] = (next[bankId] ?? []).map((product) => product.id === productId ? { ...product, consented: !product.consented } : product);
            return next;
        });
    };
    const flattenedItems = useMemo(() => {
        const entries = [];
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
        if (!userId)
            return;
        try {
            setSaving(true);
            await saveProductConsents({ user_id: userId, items: flattenedItems });
            notifySuccess('Согласия на продукты сохранены');
            navigate('/goals');
        }
        catch (error) {
            console.error(error);
            notifyError('Не удалось сохранить выбор');
        }
        finally {
            setSaving(false);
        }
    };
    const hasProducts = Object.values(products).some((list) => list.length > 0);
    return (_jsxs("div", { className: "app-main", children: [_jsxs("div", { className: "card", children: [_jsx("h2", { children: "\u0428\u0430\u0433 4. \u0412\u044B\u0431\u043E\u0440 \u0441\u0447\u0435\u0442\u043E\u0432 \u0438 \u043A\u0440\u0435\u0434\u0438\u0442\u043E\u0432" }), _jsx("p", { children: "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u043F\u0440\u043E\u0434\u0443\u043A\u0442\u044B, \u043A\u043E\u0442\u043E\u0440\u044B\u0435 \u0431\u0443\u0434\u0435\u043C \u0430\u043D\u0430\u043B\u0438\u0437\u0438\u0440\u043E\u0432\u0430\u0442\u044C." })] }), loading ? _jsx("div", { className: "card", children: "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430..." }) : null, !loading && !hasProducts ? (_jsxs("div", { className: "card", children: [_jsx("p", { children: "\u0411\u0430\u043D\u043A \u0435\u0449\u0451 \u043D\u0435 \u0432\u0435\u0440\u043D\u0443\u043B \u043F\u0440\u043E\u0434\u0443\u043A\u0442\u044B. \u041C\u043E\u0436\u043D\u043E \u043F\u0440\u043E\u0434\u043E\u043B\u0436\u0438\u0442\u044C \u0441 \u043F\u0443\u0441\u0442\u044B\u043C \u043D\u0430\u0431\u043E\u0440\u043E\u043C." }), _jsx("button", { className: "btn", onClick: () => navigate('/goals'), children: "\u041F\u0440\u043E\u0434\u043E\u043B\u0436\u0438\u0442\u044C" })] })) : null, Object.entries(products).map(([bankId, list]) => (_jsxs("div", { className: "card", children: [_jsxs("h3", { children: ["\u0411\u0430\u043D\u043A ", bankId] }), _jsx("ul", { className: "list", children: list.map((product) => (_jsx("li", { children: _jsxs("label", { style: { display: 'flex', alignItems: 'center', gap: 12 }, children: [_jsx("input", { type: "checkbox", checked: product.consented ?? true, onChange: () => toggleProduct(bankId, product.id) }), _jsxs("div", { children: [_jsx("strong", { children: product.name || product.product_type || product.id }), _jsxs("div", { style: { fontSize: 14, color: '#475569' }, children: ["\u0411\u0430\u043B\u0430\u043D\u0441: ", product.outstanding_balance ?? '—'] })] })] }) }, product.id))) })] }, bankId))), hasProducts ? (_jsx("button", { className: "btn", disabled: saving, onClick: handleSave, children: "\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u0438 \u043F\u0440\u043E\u0434\u043E\u043B\u0436\u0438\u0442\u044C" })) : null] }));
};
