import React, { useEffect, useState } from 'react';
import './App.css';

function App() {
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);  // Track loading state
  const [error, setError] = useState(null);      // Track error state

  useEffect(() => {
    // Fetch photos from the Django backend
    const fetchPhotos = async () => {
      try {
        const response = await fetch('http://localhost:8001/api/photos/');
        if (!response.ok) throw new Error('Failed to fetch photos');
        const data = await response.json();
        setPhotos(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchPhotos();
  }, []);

  return (
    <div className="App">
      <h1>Photo Gallery</h1>

      {loading ? (
        <p>Loading photos...</p>
      ) : error ? (
        <p>Error: {error}</p>
      ) : (
        <div className="gallery">
          {photos.map(photo => (
            <div key={photo.id} className="photo-card">
              <img src={`http://localhost:8001${photo.image}`} alt={photo.title} />
              <p>{photo.title}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default App;
