import React, { useState, useContext, useMemo, useRef, useEffect } from 'react';
import { Card, Table, Container, Alert } from 'react-bootstrap';
import moment from 'moment';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import './styling/waterData.css';
import { ThemeContext } from '../utility/contexts/Theme';
import Spinner from '../spinners/Spinner';

const WaterData = ({ stationId, waterData, waterDataLoading, waterDataError, onFetchWaterData }) => {
    const { darkMode } = useContext(ThemeContext);
    const [timeWindow, setTimeWindow] = useState(1);
    const [recordsPerPage, setRecordsPerPage] = useState(10);
    const [currentPage, setCurrentPage] = useState(1);
    const [selectedSeries, setSelectedSeries] = useState('water');

    const chartRef = useRef(null);
    const uplotInstance = useRef(null);

    // Sort water data for current time window (most recent first)
    const sortedWaterData = useMemo(() => {
        const data = waterData[timeWindow] || [];
        return data.length ? [...data].sort((a, b) => new Date(b.date_time) - new Date(a.date_time)) : [];
    }, [waterData, timeWindow]);

    const plotData = useMemo(() => {
        if (!sortedWaterData.length) return null;

        let dataToUse = sortedWaterData;
        if (sortedWaterData.length > 500) {
            const skipFactor = Math.ceil(sortedWaterData.length / 500);
            dataToUse = sortedWaterData.filter((_, i) => i % skipFactor === 0);
        }

        const times = dataToUse.map(entry =>
            moment(entry.date_time, 'YYYY-MM-DD HH:mm:ss').valueOf() / 1000
        );
        const waterLevels = dataToUse.map(entry => entry.water_level ?? null);
        const discharges = dataToUse.map(entry => entry.discharge ?? null);

        if (times.length !== waterLevels.length || times.length !== discharges.length) {
            return null;
        }

        return selectedSeries === 'water'
            ? [times, waterLevels]
            : [times, discharges];
    }, [sortedWaterData, selectedSeries]);

    useEffect(() => {
        if (!chartRef.current || !plotData || !plotData[0].length) return;

        if (uplotInstance.current) {
            uplotInstance.current.destroy();
            uplotInstance.current = null;
        }

        const isDark = darkMode;
        const COLORS = {
            background: isDark ? '#1a1a1a' : '#f9f9f9',
            text: isDark ? '#ffffff' : '#213547',
            grid: isDark ? '#333' : '#e0e0e0',
            primary: '#646cff',
            secondary: '#f25366',
            waterFill: 'rgba(100, 108, 255, 0.2)',
            dischargeFill: 'rgba(235, 94, 110, 0.15)'
        };

        const opts = {
            width: chartRef.current.offsetWidth,
            height: 300,
            scales: {
                x: { time: true, show: true },
                y: { auto: true },
            },
            axes: [
                {
                    stroke: COLORS.text,
                    grid: { show: true, stroke: COLORS.grid },
                    label: 'Date/Time',
                    size: 60,
                    values: (self, ticks) => {
                        const format = timeWindow <= 3 
                            ? "MM/DD HH:mm" 
                            : (timeWindow <= 3 ? "MM/DD" : "MMM DD");
                        
                        const tickSpacing = Math.ceil(ticks.length / (chartRef.current.offsetWidth / 100));
                        
                        return ticks.map((tick, i) => {
                            if (i % tickSpacing !== 0) return "";
                            return moment(tick * 1000).format(format);
                        });
                    }
                },
                {
                    stroke: selectedSeries === 'water' ? COLORS.text : COLORS.text,
                    grid: { stroke: COLORS.grid },
                    size: selectedSeries === 'water' ? 70 : 80, // Increase axis size to accommodate label
                }
            ],
            series: [
                {
                  label: "Time",
                  scale: "x"
                },
                selectedSeries === 'water'
                    ? {
                        label: 'Water Level',
                        stroke: COLORS.primary,
                        width: 2,
                        fill: COLORS.waterFill,
                        points: { show: false },
                    }
                    : {
                        label: 'Discharge',
                        stroke: COLORS.secondary,
                        width: 2,
                        fill: COLORS.dischargeFill,
                        points: { show: false },
                    }
            ],
            cursor: {
                y: false,
                drag: { x: true, y: false }
              },
              legend: {
                show: true,
                live: true,
              },
              hooks: {
                draw: [
                  (u) => {
                    const legend = u.root.querySelector(".u-legend");
                    if (legend) {
                      legend.style.color = COLORS.text;
                    }
                  }
                ],
              }
              
        };

        uplotInstance.current = new uPlot(opts, plotData, chartRef.current);

        const handleResize = () => {
            if (uplotInstance.current) {
                uplotInstance.current.setSize({
                    width: chartRef.current.offsetWidth,
                    height: 300,
                });
            }
        };

        window.addEventListener('resize', handleResize);
        return () => {
            window.removeEventListener('resize', handleResize);
            if (uplotInstance.current) uplotInstance.current.destroy();
        };
    }, [plotData, darkMode, selectedSeries, timeWindow]);

    const indexOfLastRecord = currentPage * recordsPerPage;
    const indexOfFirstRecord = indexOfLastRecord - recordsPerPage;
    const currentWaterData = sortedWaterData.slice(indexOfFirstRecord, indexOfLastRecord);
    const totalPages = Math.ceil(sortedWaterData.length / recordsPerPage);

    const handleTimeWindowChange = (days) => {
        setTimeWindow(days);
        setCurrentPage(1);
        
        if (!waterData[days] && !waterDataLoading[days]) {
            onFetchWaterData(days);
        }
    };

    return (
        <Container fluid className="px-0">
            {waterDataError[timeWindow] && <Alert variant="danger">{waterDataError[timeWindow]}</Alert>}

            <Card className="mb-2" style={{ width: '100%', borderRadius: '0.25rem', border: '1px solid var(--border-colour)' }}>
                <Card.Body>
                    <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap">
                        <h5 className="mb-2 mb-md-0">Water Data Visualization</h5>
                        <div className="d-flex gap-2">
                            <button
                                onClick={() => setSelectedSeries('water')}
                                style={{
                                    padding: '6px 12px',
                                    backgroundColor: selectedSeries === 'water' ? 'var(--primary-colour)' : 'var(--button-bg)',
                                    color: selectedSeries === 'water' ? 'var(--primary-text-colour)' : 'var(--text-colour)',
                                    border: '1px solid var(--border-colour)',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                }}
                            >
                                Water Level (m)
                            </button>
                            <button
                                onClick={() => setSelectedSeries('discharge')}
                                style={{
                                    padding: '6px 12px',
                                    backgroundColor: selectedSeries === 'discharge' ? 'var(--primary-colour)' : 'var(--button-bg)',
                                    color: selectedSeries === 'discharge' ? 'var(--primary-text-colour)' : 'var(--text-colour)',
                                    border: '1px solid var(--border-colour)',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                }}
                            >
                                Discharge (m³/s)
                            </button>
                        </div>
                    </div>

                    <div className="d-flex gap-1 flex-wrap mb-3">
                        {[1, 3, 7, 14, 30].map((days) => (
                            <button
                                key={days}
                                onClick={() => handleTimeWindowChange(days)}
                                style={{
                                    padding: '6px 10px',
                                    fontSize: '0.75rem',
                                    backgroundColor: timeWindow === days ? 'var(--primary-colour)' : 'var(--button-bg)',
                                    color: timeWindow === days ? 'var(--primary-text-colour)' : 'var(--text-colour)',
                                    border: '1px solid var(--border-colour)',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    opacity: waterDataLoading[days] ? 0.7 : 1,
                                    position: 'relative',
                                }}
                                disabled={waterDataLoading[days]}
                            >
                                {days} Day{days > 1 ? 's' : ''}
                                {waterDataLoading[days] && (
                                    <span className="spinner-border spinner-border-sm ms-1" 
                                          style={{width: '10px', height: '10px'}} 
                                          role="status" aria-hidden="true">
                                    </span>
                                )}
                            </button>
                        ))}
                    </div>

                    {waterDataLoading[timeWindow] ? (
                        <div className="d-flex justify-content-center align-items-center" style={{ height: '200px' }}>
                            <Spinner size="60px" color="var(--primary-colour)" message="Fetching data..." />
                        </div>
                    ) : (
                        <div>
                            <div ref={chartRef} className="uplot-wrapper mb-3" style={{ width: '100%' }} />
                        </div>
                    )}

                    <div className="table-responsive">
                        <Table className={`table table-striped table-hover ${darkMode ? 'table-dark' : ''}`}>
                            <thead>
                                <tr>
                                    <th>Date/Time</th>
                                    <th>Water Level</th>
                                    <th>Discharge</th>
                                </tr>
                            </thead>
                            <tbody>
                                {waterDataLoading[timeWindow] ? (
                                    <tr>
                                        <td colSpan="3" className="text-center">Loading data...</td>
                                    </tr>
                                ) : currentWaterData.length === 0 ? (
                                    <tr>
                                        <td colSpan="3" className="text-center">No data available</td>
                                    </tr>
                                ) : (
                                    currentWaterData.map((entry, index) => (
                                        <tr key={index}>
                                            <td>
                                                {entry.date_time
                                                    ? moment(entry.date_time, 'YYYY-MM-DD HH:mm:ss').format('MMMM Do YYYY, h:mm a')
                                                    : 'N/A'}
                                            </td>
                                            <td>{entry.water_level !== null ? `${entry.water_level} m` : 'N/A'}</td>
                                            <td>{entry.discharge !== null ? `${entry.discharge} m³/s` : 'N/A'}</td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </Table>
                    </div>

                    <div className="d-flex justify-content-between align-items-center flex-wrap mt-3 gap-2">
                        <div className="records-container">
                            <span className="d-none d-sm-inline me-1">Records:</span>
                            {[10, 25, 50, 100].map((num) => (
                                <button
                                    key={num}
                                    onClick={() => {
                                        setRecordsPerPage(num);
                                        setCurrentPage(1);
                                    }}
                                    style={{
                                        padding: '4px 8px',
                                        backgroundColor: recordsPerPage === num ? 'var(--primary-colour)' : 'var(--button-bg)',
                                        color: recordsPerPage === num ? 'var(--primary-text-colour)' : 'var(--text-colour)',
                                        border: '1px solid var(--border-colour)',
                                        borderRadius: '4px',
                                        cursor: 'pointer',
                                        fontSize: '0.85rem',
                                    }} 
                                    className='record-btns'
                                >
                                    {num}
                                </button>
                            ))}
                        </div>
                        <div className="d-flex align-items-center pagination-controls">
                            <button 
                                onClick={() => setCurrentPage(1)} 
                                disabled={currentPage === 1 || waterDataLoading[timeWindow]} 
                                className="pagination-btn"
                                aria-label="First page"
                            >
                                <span aria-hidden="true">«</span>
                            </button>
                            <button 
                                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))} 
                                disabled={currentPage === 1 || waterDataLoading[timeWindow]} 
                                className="pagination-btn"
                                aria-label="Previous page"
                            >
                                <span aria-hidden="true">‹</span>
                            </button>
                            <span className="pagination-info">
                                {currentPage}/{totalPages || 1}
                            </span>
                            <button 
                                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))} 
                                disabled={currentPage === totalPages || waterDataLoading[timeWindow] || totalPages === 0} 
                                className="pagination-btn"
                                aria-label="Next page"
                            >
                                <span aria-hidden="true">›</span>
                            </button>
                            <button 
                                onClick={() => setCurrentPage(totalPages)} 
                                disabled={currentPage === totalPages || waterDataLoading[timeWindow] || totalPages === 0} 
                                className="pagination-btn"
                                aria-label="Last page"
                            >
                                <span aria-hidden="true">»</span>
                            </button>
                        </div>
                    </div>
                </Card.Body>
            </Card>
        </Container>
    );
};

export default WaterData;