import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

export default function AgentPropertiesView() {
  const { userProfile } = useAuth();
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedProperty, setSelectedProperty] = useState(null);
  const [filterTown, setFilterTown] = useState('');

  useEffect(() => {
    if (userProfile?.role === 'agent') {
      loadAgentProperties();
    }
  }, [userProfile]);

  const loadAgentProperties = async () => {
    try {
      const { data: accessData, error: accessError } = await supabase
        .from('agent_property_access')
        .select('property_id, town_name')
        .eq('agent_id', userProfile.id);

      if (accessError) throw accessError;

      const propertyIds = accessData?.map(d => d.property_id) || [];

      if (propertyIds.length === 0) {
        setProperties([]);
        setLoading(false);
        return;
      }

      const agentTowns = (userProfile?.agent_towns || '').split(',').map(t => t.trim()).filter(Boolean);

      let query = supabase
        .from('properties')
        .select('*')
        .in('id', propertyIds);

      if (agentTowns.length > 0) {
        query = query.in('Town_Name', agentTowns);
      }

      const { data: propertyData, error: propertyError } = await query.order('Town_Name');

      if (propertyError) throw propertyError;

      const propNumbers = (propertyData || []).map(p => ({
        type: p.Property_Type,
        number: p.Property_Number,
        town: p.Town_Name,
      }));

      let salesData = [];
      if (propNumbers.length > 0) {
        const orFilters = propNumbers.map(p =>
          `and(Type.eq.${p.type},Plot_Shop_Number.eq.${p.number},Town_Name.eq.${p.town})`
        ).join(',');
        const { data: sd, error: sdErr } = await supabase
          .from('all_sales')
          .select('*')
          .or(orFilters);
        if (!sdErr) salesData = sd || [];
      }

      const salesMap = new Map(
        salesData.map(s => [`${s.Type}__${s.Plot_Shop_Number}__${s.Town_Name}`, s])
      );

      const merged = (propertyData || []).map(p => {
        const key = `${p.Property_Type}__${p.Property_Number}__${p.Town_Name}`;
        const sale = salesMap.get(key);
        return {
          ...p,
          id: p.id,
          type: p.Property_Type,
          plot_shop_number: p.Property_Number,
          town_name: p.Town_Name,
          customer_name: sale?.Customer_Name || p.Customer_Name || '',
          total_amount_pkr: sale?.Total_Amount_PKR || p.Total_Amount_PKR || 0,
          status: sale?.Status || p.Status || 'Available',
        };
      });

      setProperties(merged);
    } catch (error) {
      console.error('Error loading properties:', error);
    } finally {
      setLoading(false);
    }
  };

  const agentTowns = (userProfile?.agent_towns || '').split(',').map(t => t.trim()).filter(Boolean);
  const filteredProperties = filterTown
    ? properties.filter(p => p.town_name === filterTown)
    : properties;

  if (!userProfile || userProfile.role !== 'agent') {
    return (
      <div style={{ padding: 20, textAlign: 'center' }}>
        <p style={{ color: 'var(--text-muted)' }}>{'\u26A0\uFE0F'} Only agents can access this section</p>
      </div>
    );
  }

  return (
    <div style={{ padding: 20 }}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>{'\u{1F4CA}'} My Properties</h2>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
          Properties CEO has given you access to
        </p>

        <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          <button
            onClick={() => setFilterTown('')}
            style={{
              padding: '8px 14px',
              background: !filterTown ? 'var(--accent-blue)' : 'var(--border-color)',
              color: !filterTown ? 'white' : 'var(--text-primary)',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: 12,
            }}
          >
            {'\u{1F30D}'} All Towns
          </button>
          {agentTowns.map(town => (
            <button
              key={town}
              onClick={() => setFilterTown(town)}
              style={{
                padding: '8px 14px',
                background: filterTown === town ? 'var(--accent-blue)' : 'var(--border-color)',
                color: filterTown === town ? 'white' : 'var(--text-primary)',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: 12,
              }}
            >
              {'\u{1F4CD}'} {town}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
          {'\u23F3'} Loading properties...
        </div>
      ) : filteredProperties.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
          {'\u{1F4ED}'} No properties assigned yet. CEO will grant access soon.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {filteredProperties.map(property => (
            <div
              key={property.id}
              onClick={() => setSelectedProperty(property)}
              style={{
                padding: 16,
                background: 'var(--bg-card)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-md)',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--accent-blue)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,102,204,0.15)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--border-color)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 8 }}>
                {property.type || property.property_type} #{property.plot_shop_number}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
                {'\u{1F4CD}'} {property.town_name}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>Buyer</div>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{property.customer_name || property.buyer_name || 'N/A'}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>Price</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent-green)' }}>
                    PKR {(property.total_amount_pkr || property.total_price || 0)?.toLocaleString()}
                  </div>
                </div>
              </div>
              <button
                style={{
                  width: '100%',
                  padding: '8px',
                  background: 'var(--accent-blue)',
                  color: 'white',
                  border: 'none',
                  borderRadius: 'var(--radius-md)',
                  fontWeight: 600,
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                {'\u{1F441}\uFE0F'} View Details
              </button>
            </div>
          ))}
        </div>
      )}

      {selectedProperty && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: 20,
        }}>
          <div style={{
            background: 'var(--bg-card)',
            borderRadius: 'var(--radius-lg)',
            padding: 30,
            maxWidth: 600,
            width: '100%',
            maxHeight: '85vh',
            overflowY: 'auto',
            position: 'relative',
          }}>
            <button
              onClick={() => setSelectedProperty(null)}
              style={{
                position: 'absolute',
                top: 15,
                right: 15,
                background: 'transparent',
                border: 'none',
                fontSize: 24,
                cursor: 'pointer',
                color: 'var(--text-muted)',
              }}
            >
              {'\u2715'}
            </button>

            <div style={{ marginBottom: 20 }}>
              <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 12 }}>
                {selectedProperty.type || selectedProperty.property_type} #{selectedProperty.plot_shop_number}
              </h3>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase' }}>
                    Location
                  </div>
                  <div style={{ fontSize: 13 }}>{'\u{1F4CD}'} {selectedProperty.town_name}</div>
                </div>

                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase' }}>
                    Size
                  </div>
                  <div style={{ fontSize: 13 }}>{selectedProperty.property_size || selectedProperty.size || 'N/A'}</div>
                </div>

                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase' }}>
                    Buyer
                  </div>
                  <div style={{ fontSize: 13 }}>{selectedProperty.customer_name || selectedProperty.buyer_name}</div>
                </div>

                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase' }}>
                    CNIC
                  </div>
                  <div style={{ fontSize: 13 }}>{selectedProperty.cnic || selectedProperty.buyer_cnic}</div>
                </div>

                <div style={{ gridColumn: '1 / -1' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase' }}>
                    Total Price
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--accent-green)' }}>
                    PKR {(selectedProperty.total_amount_pkr || selectedProperty.total_price || 0)?.toLocaleString()}
                  </div>
                </div>
              </div>

              <button
                onClick={() => setSelectedProperty(null)}
                style={{
                  width: '100%',
                  padding: '10px',
                  background: 'var(--border-color)',
                  border: 'none',
                  borderRadius: 'var(--radius-md)',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
